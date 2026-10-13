// chatApi.js — FIXED & OCR-SAFE VERSION (JSON + multipart fallback)

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:8001";

export async function sendChat({
  message,
  imageFile = null,
  medical = false,
}) {
  if (!message?.trim() && !imageFile) {
    throw new Error("Message or image required");
  }

  let image_base64 = null;

  if (imageFile) {
    if (!(imageFile instanceof File || imageFile instanceof Blob)) {
      console.error("❌ Invalid imageFile:", imageFile);
      throw new Error("Invalid image file");
    }

    image_base64 = await fileToBase64(imageFile);

    if (!image_base64 || image_base64.length < 800) {
      console.warn("⚠️ Image base64 too small or empty");
      image_base64 = null;
    }
  }

  // Debug
  console.log("📦 chatApi payload:", {
    promptPreview: message?.slice(0, 80),
    hasImage: !!image_base64,
    imageLength: image_base64?.length || 0,
    backend: BACKEND_URL,
  });

  // Try JSON first
  const bodyObj = {
    prompt: message,
    message, // keep both for proxies
    medical,
  };
  if (image_base64) bodyObj.image_base64 = image_base64;

  try {
    const res = await fetch(`${BACKEND_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj),
    });

    // if server rejects due to size or unsupported media, try multipart
    if (res.status === 413 || res.status === 415 || !res.ok) {
      if (imageFile) {
        console.warn("JSON rejected by server; trying multipart fallback.");
        return await multipartUpload({ message, imageFile, medical });
      } else {
        const text = await res.text().catch(() => "");
        throw new Error(`Backend error: ${res.status} ${text}`);
      }
    }

    return await res.json();
  } catch (err) {
    console.error("JSON upload failed:", err);
    if (imageFile) {
      // try multipart fallback
      try {
        return await multipartUpload({ message, imageFile, medical });
      } catch (merr) {
        console.error("Multipart fallback failed:", merr);
        throw merr;
      }
    }
    throw err;
  }
}

async function multipartUpload({ message, imageFile, medical }) {
  const fd = new FormData();
  fd.append("prompt", message);
  fd.append("message", message);
  fd.append("medical", medical ? "1" : "0");
  fd.append("image", imageFile, imageFile.name || "image.jpg");

  const res = await fetch(`${BACKEND_URL}/chat`, {
    method: "POST",
    body: fd, // browser will set multipart boundary header
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Multipart upload failed: ${res.status} ${text}`);
  }
  return res.json();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const result = String(reader.result);
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(base64.trim());
      } catch (e) {
        reject(e);
      }
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
