

// useChat.jsx — FINAL, QUEUE-SAFE, AUDIO-SAFE, ABORT-SAFE VERSION
import { createContext, useContext, useEffect, useState, useRef } from "react";

/* ================= CONFIG ================= */

const backendUrl =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

const DEFAULT_TIMEOUT_MS = 180000; // 3 minutes
const TIMEOUT_MS =
  import.meta.env.VITE_CHAT_TIMEOUT_MS
    ? parseInt(import.meta.env.VITE_CHAT_TIMEOUT_MS, 10)
    : DEFAULT_TIMEOUT_MS;

const MAX_ABORT_RETRIES = 1;

/* ================= CONTEXT ================= */

const ChatContext = createContext();

/* ================= UTILS ================= */

/** Convert File -> base64 (no data:image prefix) */
const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

/* ================= PROVIDER ================= */

export const ChatProvider = ({ children }) => {
  /** Queue of messages */
  const [messages, setMessages] = useState([]);

  /** Currently active message (queue head) */
  const [message, setMessage] = useState(null);

  const [loading, setLoading] = useState(false);
  const [cameraZoomed, setCameraZoomed] = useState(true);

  /** Prevent double dequeue */
  const isDequeuingRef = useRef(false);

  /* ============== SAFE FETCH ==============
     - allowAbort: when false, no AbortController is used (safe for long medical requests)
     - timeoutMs: number or null. When null + allowAbort true => no timeout but still abort allowed
  */
  const fetchSafe = async (
    url,
    options = {},
    { timeoutMs = null, allowAbort = true } = {}
  ) => {
    // Lightweight logging about the request (method + body shape)
    const method = (options.method || "GET").toUpperCase();
    const body = options.body;
    try {
      if (body instanceof FormData) {
        console.log(`[fetchSafe] Request -> ${method} ${url} (body: FormData, fields unknown for security)`);
      } else if (typeof body === "string") {
        console.log(
          `[fetchSafe] Request -> ${method} ${url} (body: JSON string, length=${body.length})`
        );
      } else if (body == null) {
        console.log(`[fetchSafe] Request -> ${method} ${url} (no body)`);
      } else {
        console.log(`[fetchSafe] Request -> ${method} ${url} (body type: ${typeof body})`);
      }

      if (!allowAbort || !timeoutMs) {
        // No AbortController: guaranteed not to be aborted by this client
        console.log(`[fetchSafe] Sending without AbortController (allowAbort=${allowAbort}, timeoutMs=${timeoutMs})`);
        const resp = await fetch(url, options);
        console.log(`[fetchSafe] Response status: ${resp.status} ${resp.statusText}`);
        return resp;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn(`[fetchSafe] Timeout reached (${timeoutMs} ms) — aborting request to ${url}`);
        controller.abort();
      }, timeoutMs);

      try {
        console.log(`[fetchSafe] Sending with AbortController (timeout ${timeoutMs}ms)`);
        const resp = await fetch(url, { ...options, signal: controller.signal });
        console.log(`[fetchSafe] Response status: ${resp.status} ${resp.statusText}`);
        return resp;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      console.error(`[fetchSafe] Network/Fetch error for ${method} ${url}:`, err);
      throw err;
    }
  };

  /* ================= MAIN CHAT ================= */

  const chat = async (messageText, options = {}) => {
    if (!messageText?.trim() && !options?.imageFile) return;

    setLoading(true);

    const { medical = false, imageFile = null } = options;

    console.log(`[chat] Called — medical=${medical}, hasImage=${!!imageFile}, textLen=${(messageText||"").length}`);

    if (imageFile) {
      console.log(
        `[chat] Image info — name="${imageFile.name}", size=${imageFile.size} bytes, type="${imageFile.type}"`
      );
    }

    // If there's a file, send multipart/form-data (more robust than huge JSON body)
    let attempt = 0;

    while (attempt <= MAX_ABORT_RETRIES) {
      const timeout =
        attempt === 0 ? TIMEOUT_MS : Math.max(TIMEOUT_MS * 2, 60000);

      try {
        let res;
        if (imageFile) {
          // Send multipart form with file
          const form = new FormData();
          form.append("message", messageText);
          // Keep 'medical' flag available for backend if needed
          if (medical) form.append("medical", "1");
          // field name expected by your backend: "image"
          form.append("image", imageFile, imageFile.name || "upload.jpg");

          console.log(`[chat] Sending multipart to ${backendUrl}/chat — medical=${medical}`);
          res = await fetchSafe(
            `${backendUrl}/chat`,
            {
              method: "POST",
              body: form, // browser sets correct Content-Type boundary
            },
            {
              timeoutMs: medical ? null : timeout,
              allowAbort: !medical,
            }
          );
        } else {
          // JSON path (no file)
          const payload = { message: messageText, medical };
          console.log(`[chat] Sending JSON to ${backendUrl}/chat — medical=${medical}, payloadLen=${JSON.stringify(payload).length}`);
          res = await fetchSafe(
            `${backendUrl}/chat`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
            {
              timeoutMs: medical ? null : timeout,
              allowAbort: !medical,
            }
          );
        }

        if (!res.ok) {
          console.warn(`[chat] Server returned non-OK status: ${res.status} ${res.statusText}`);
          enqueueSystemMessage(
            "Sorry — the server returned an error.",
            "sad"
          );
          break;
        }

        const json = await res.json();

        console.log(`[chat] Received response JSON. top-level keys: ${json ? Object.keys(json).join(", ") : "null"}`);

        const backendMessages = Array.isArray(json?.messages)
          ? json.messages
          : [];

        console.log(`[chat] Backend returned ${backendMessages.length} message(s)`);

        if (backendMessages.length) {
          // preview first few chars of each message (for debug)
          backendMessages.slice(0, 3).forEach((bm, idx) => {
            const preview = (bm?.text || "").replace(/\s+/g, " ").slice(0, 120);
            console.log(`[chat] message[${idx}] preview: "${preview}${(bm?.text||"").length>120 ? "..." : ""}"`);
          });
        }

        if (!backendMessages.length) {
          enqueueSystemMessage(
            "Sorry, I didn't get a response.",
            "default"
          );
        } else {
          // append to queue, do not overwrite
          setMessages((prev) => [...prev, ...backendMessages]);
        }

        break;
      } catch (err) {
        console.error(
          `Chat request failed (attempt ${attempt + 1}):`,
          err
        );

        if (err && err.name === "AbortError") {
          console.warn(`[chat] Request aborted (attempt ${attempt + 1}).`);
          if (attempt < MAX_ABORT_RETRIES) {
            attempt += 1;
            console.log(`[chat] Retrying after abort (retry ${attempt})...`);
            await new Promise((r) => setTimeout(r, 400));
            continue;
          }
        }

        enqueueSystemMessage(
          "Chat service unavailable. Please try again.",
          "default"
        );
        break;
      }
    }

    setLoading(false);
  };

  /* ================= QUEUE HELPERS ================= */

  const enqueueSystemMessage = (text, facialExpression = "default") => {
    console.log(`[enqueueSystemMessage] "${text}" (${facialExpression})`);
    setMessages((prev) => [
      ...prev,
      {
        text,
        animation: "Idle",
        facialExpression,
        audio: null,
        lipsync: null,
      },
    ]);
  };

  /**
   * Called by Avatar after audio ends
   * GUARANTEED single dequeue
   */
  const onMessagePlayed = () => {
    if (isDequeuingRef.current) return;
    isDequeuingRef.current = true;

    console.log("[onMessagePlayed] Dequeuing head message");
    setMessages((prev) => (prev.length ? prev.slice(1) : prev));

    setTimeout(() => {
      isDequeuingRef.current = false;
    }, 0);
  };

  /* ================= TRACK QUEUE HEAD ================= */

  useEffect(() => {
    setMessage(messages.length ? messages[0] : null);
  }, [messages]);

  /* ================= NOTE: NO CLEANUP ABORT =================
     We intentionally do NOT abort active requests on unmount because:
     - Medical (long) requests must be allowed to finish
     - Aborting here caused 'AbortError: signal is aborted without reason'
  */

  /* ================= CONTEXT ================= */

  return (
    <ChatContext.Provider
      value={{
        chat,
        message,
        onMessagePlayed,
        loading,
        cameraZoomed,
        setCameraZoomed,
        messages,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

/* ================= HOOK ================= */

export const useChat = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChat must be used within ChatProvider");
  }
  return ctx;
};
