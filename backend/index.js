// index.js — Virtual Girlfriend backend with Kokoro (Python) integration
// ESM + top-level await. Ensure package.json has: "type": "module"
import { exec } from "child_process";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { promises as fs } from "fs";
import path from "path";
import Groq from "groq-sdk";
import axios from "axios";
import Gtts from "gtts"; // npm i gtts
import multer from "multer"; // npm i multer
import FormData from "form-data"; // npm i form-data

dotenv.config();
/* ---------------- Configuration ---------------- */
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const ELEVEN_LABS_API_KEY_ORIG = process.env.ELEVEN_LABS_API_KEY || "";
let ELEVEN_LABS_API_KEY = (ELEVEN_LABS_API_KEY_ORIG || "").trim();
const ELEVEN_VOICE_ID = (process.env.ELEVEN_VOICE_ID || "").trim();
const PORT = parseInt(process.env.PORT || "3000", 10);
const PRIMARY_MODEL = process.env.PRIMARY_MODEL || process.env.GROQ_PRIMARY_MODEL || "llama-3.1-8b-instant";
const FALLBACK_MODEL = process.env.FALLBACK_MODEL || process.env.GROQ_FALLBACK_MODEL || "mixtral-8x7b-32768";
const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg"; // prefer on PATH if not specified
let RHUBARB_PATH = process.env.RHUBARB_PATH || "rhubarb";
const AUDIO_DIR = "audios";
const MEDICAL_API_URL = process.env.MEDICAL_API_URL || "http://127.0.0.1:8001";
const MEDICAL_API_TIMEOUT = parseInt(process.env.MEDICAL_API_TIMEOUT || "120000", 10); // ms
const KOKORO_PY_URL = process.env.KOKORO_PY_URL || "http://127.0.0.1:5002/tts";
const KOKORO_TIMEOUT = parseInt(process.env.KOKORO_TIMEOUT || "2000", 10); // Reduced to 2s for quick fallback to gTTS
const ELEVEN_CONCURRENCY = parseInt(process.env.ELEVEN_CONCURRENCY || "1", 10); // Reduced to 1 to avoid quota hits
const KOKORO_CONCURRENCY = parseInt(process.env.KOKORO_CONCURRENCY || "2", 10); // Parallel kokoro chunk workers, reduced for stability

/* ---------------- Small semaphore ---------------- */
class Semaphore {
  constructor(max) {
    this.max = Math.max(1, max || 1);
    this.current = 0;
    this.queue = [];
  }
  async acquire() {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    await new Promise((resolve) => this.queue.push(resolve));
    this.current++;
  }
  release() {
    this.current = Math.max(0, this.current - 1);
    if (this.queue.length > 0) {
      const resolve = this.queue.shift();
      resolve();
    }
  }
  async use(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
const elevenSemaphore = new Semaphore(ELEVEN_CONCURRENCY);
const kokoroSemaphore = new Semaphore(KOKORO_CONCURRENCY);

/* ---------------- Setup express ---------------- */
// Increase JSON limit (50mb) to allow reasonable base64 fallback; prefer multipart though
const JSON_LIMIT = "50mb";
const app = express();
app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.urlencoded({ limit: JSON_LIMIT, extended: true }));
app.use(cors());

/* ---------------- multer (memory) for file uploads ---------------- */
const multerStorage = multer.memoryStorage();
const upload = multer({
  storage: multerStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB limit. Adjust if needed.
  },
});

/* ---------------- Groq client init ---------------- */
const groqClient = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

/* ---------------- Utilities ---------------- */
const execCommand = (command) =>
  new Promise((resolve, reject) => {
    exec(command, { maxBuffer: 1024 * 1024 * 40 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(`${error.message}\n${stderr || ""}`));
      return resolve(stdout);
    });
  });
const ensureAudioDir = async () => {
  try {
    await fs.mkdir(AUDIO_DIR, { recursive: true });
    console.log(`Ensured ${AUDIO_DIR}/ exists.`);
  } catch (err) {
    console.warn("Could not ensure audio directory:", err.message || err);
  }
};
let HAS_FFMPEG = false;
let HAS_RHUBARB = false;
const detectTools = async () => {
  try {
    await execCommand(`"${FFMPEG_PATH}" -hide_banner -version`);
    HAS_FFMPEG = true;
    console.log("ffmpeg found at", FFMPEG_PATH);
  } catch (err1) {
    try {
      await execCommand("ffmpeg -hide_banner -version");
      HAS_FFMPEG = true;
      console.log("ffmpeg found in PATH (using 'ffmpeg').");
    } catch (err2) {
      HAS_FFMPEG = false;
      console.warn("ffmpeg not found. Some audio merges will fallback to naive concat.");
    }
  }
  try {
    await execCommand(`"${RHUBARB_PATH}" --version`);
    HAS_RHUBARB = true;
    console.log("rhubarb found at", RHUBARB_PATH);
  } catch (err1) {
    try {
      await execCommand("rhubarb --version");
      HAS_RHUBARB = true;
      RHUBARB_PATH = "rhubarb";
      console.log("rhubarb found in PATH (using 'rhubarb').");
    } catch (err2) {
      HAS_RHUBARB = false;
      console.warn("rhubarb not found. Lip-sync will be skipped.");
    }
  }
};
await ensureAudioDir();
await detectTools();

/* ---------------- Groq helper ---------------- */
async function groqChatWithFallback(model, messages, options = {}) {
  if (!groqClient) throw new Error("Groq client not initialized. Check GROQ_API_KEY.");
  return await groqClient.chat.completions.create({
    model,
    messages,
    temperature: options.temperature ?? 0.6,
    max_tokens: options.max_tokens ?? 1000,
  });
}

/* ---------------- ElevenLabs helpers ---------------- */
let ELEVEN_ENABLED = !!ELEVEN_LABS_API_KEY;
async function elevenTTSToBuffer(apiKey, voiceId, text) {
  if (!apiKey || !ELEVEN_ENABLED) throw new Error("Missing or disabled ElevenLabs API key");
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;
  const maxRetries = 2; // Reduced for faster failure
  let attempt = 0;
  let backoff = 500; // ms
  const doRequest = async () => {
    attempt++;
    try {
      const resp = await axios.post(
        url,
        { text, voice_settings: { stability: 0, similarity_boost: 0 } },
        {
          responseType: "arraybuffer",
          headers: {
            Accept: "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": apiKey,
          },
          validateStatus(status) {
            return status >= 200 && status < 300;
          },
          timeout: 10000, // Reduced timeout
        }
      );
      return Buffer.from(resp.data);
    } catch (err) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      const bodyStr = body ? JSON.stringify(body).toLowerCase() : "";
      if (status === 401 || bodyStr.includes("unauthorized") || bodyStr.includes("quota_exceeded") || bodyStr.includes("unusual_activity")) {
        ELEVEN_ENABLED = false;
        console.warn("ElevenLabs quota/auth error — disabling ElevenLabs for this session.");
        throw new Error(`ElevenLabs TTS failed (status ${status}): ${err.message}`);
      }
      const tooMany = status === 429 || bodyStr.includes("too_many") || bodyStr.includes("concurrent");
      if (tooMany && attempt < maxRetries) {
        console.warn(`ElevenLabs 429/concurrency (attempt ${attempt}). Backoff ${backoff}ms`);
        await new Promise((r) => setTimeout(r, backoff));
        backoff *= 2;
        return doRequest();
      }
      const message = `ElevenLabs TTS failed${status ? ` (status ${status})` : ""}: ${err.message}`;
      const detailed = body ? ` response: ${JSON.stringify(body).slice(0, 400)}` : "";
      throw new Error(message + detailed);
    }
  };
  return doRequest();
}
async function limitedElevenTTS(apiKey, voiceId, text) {
  if (!ELEVEN_ENABLED) throw new Error("ElevenLabs disabled (invalid key or quota error).");
  return elevenSemaphore.use(() => elevenTTSToBuffer(apiKey, voiceId, text));
}

/* ---------------- Splitters ---------------- */
function splitToChunks(text, maxLen = 350) { // Reduced chunk size for faster gTTS/Kokoro
  if (!text) return [""];
  const lines = text.split(/\n+/);
  const sentences = [];
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    if (/^([-*•]|\d+[\.\)])\s+/.test(trimmedLine)) {
      sentences.push(trimmedLine);
      continue;
    }
    const lineSents = trimmedLine.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [trimmedLine];
    for (const s of lineSents) {
      const t = s.trim();
      if (t) sentences.push(t);
    }
  }
  const chunks = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + " " + s).trim().length <= maxLen) {
      cur = (cur + " " + s).trim();
    } else {
      if (cur) chunks.push(cur);
      if (s.length > maxLen) {
        const words = s.split(/\s+/);
        let tmp = "";
        for (const w of words) {
          if ((tmp + " " + w).trim().length > maxLen) {
            if (tmp) chunks.push(tmp.trim());
            tmp = w;
            if (w.length > maxLen) {
              chunks.push(w.slice(0, maxLen) + "...");
              tmp = "";
            }
          } else {
            tmp = (tmp + " " + w).trim();
          }
        }
        if (tmp) chunks.push(tmp);
        cur = "";
      } else {
        cur = s;
      }
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/* ---------------- Helpers for MP3 concat (strip ID3v2) ---------------- */
function stripID3v2IfPresent(buffer) {
  if (!buffer || buffer.length < 10) return buffer;
  try {
    if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
      const sizeBytes = buffer.slice(6, 10);
      let size = 0;
      for (let i = 0; i < 4; i++) {
        size = (size << 7) | (sizeBytes[i] & 0x7f);
      }
      const headerSize = 10 + size;
      if (headerSize < buffer.length) return buffer.slice(headerSize);
      return Buffer.alloc(0);
    }
  } catch (e) {}
  return buffer;
}

/* ---------------- MIME detection ---------------- */
function mimeFromBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return "audio/mpeg";
  const head = buf.slice(0, 4).toString("utf8", 0, 4);
  if (head === "RIFF") return "audio/wav";
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return "audio/mpeg";
  if (buf[0] === 0xff && (buf[1] & 0b11100000) === 0b11100000) return "audio/mpeg";
  return "audio/mpeg";
}

/* ---------------- Conversion helper: buffer -> mp3 using ffmpeg ---------------- */
async function bufferToMp3(buffer, tmpPrefix) {
  if (!HAS_FFMPEG) throw new Error("ffmpeg required to convert to mp3");
  const inPath = path.join(AUDIO_DIR, `${tmpPrefix}_in_${Date.now()}`);
  const outPath = path.join(AUDIO_DIR, `${tmpPrefix}_out_${Date.now()}.mp3`);
  try {
    await fs.writeFile(inPath + ".wav", buffer);
    await execCommand(`"${FFMPEG_PATH}" -y -i "${inPath}.wav" -c:a libmp3lame -b:a 192k "${outPath}"`);
    const outBuf = await fs.readFile(outPath);
    await fs.unlink(inPath + ".wav").catch(()=>{});
    await fs.unlink(outPath).catch(()=>{});
    return outBuf;
  } catch (e) {
    try {
      await fs.writeFile(inPath, buffer);
      await execCommand(`"${FFMPEG_PATH}" -y -i "${inPath}" -c:a libmp3lame -b:a 192k "${outPath}"`);
      const outBuf = await fs.readFile(outPath);
      await fs.unlink(inPath).catch(()=>{});
      await fs.unlink(outPath).catch(()=>{});
      return outBuf;
    } catch (e2) {
      await fs.unlink(inPath).catch(()=>{});
      await fs.unlink(inPath + ".wav").catch(()=>{});
      await fs.unlink(outPath).catch(()=>{});
      throw new Error("ffmpeg conversion to mp3 failed: " + (e2.message || e2));
    }
  }
}

/* ---------------- Kokoro Python wrapper (fallback only) ----------------
   Expects kokoro_server.py POST /tts -> { audio_base64, sample_rate }
   Use as fallback after gTTS attempt if needed, but prioritize gTTS for speed.
*/
async function kokoroPyBuffer(text, voice = "af_heart", speed = 1.0) {
  if (!text || !text.trim()) throw new Error("Empty text for Kokoro");
  console.log("Trying Kokoro fallback TTS...");
  try {
    const resp = await kokoroSemaphore.use(() => axios.post( // Use semaphore for concurrency
      KOKORO_PY_URL,
      { text, voice, speed },
      { timeout: KOKORO_TIMEOUT }
    ));
    if (!resp.data || !resp.data.audio_base64) throw new Error("Invalid response from Kokoro server");
    const wavBuf = Buffer.from(resp.data.audio_base64, "base64");
    if (HAS_FFMPEG) {
      try {
        const mp3Buf = await bufferToMp3(wavBuf, "kokoro");
        console.log("Kokoro TTS succeeded (converted to MP3).");
        return mp3Buf;
      } catch (e) {
        console.warn("Kokoro conversion failed, returning WAV.");
        return wavBuf;
      }
    } else {
      console.log("Kokoro TTS succeeded (WAV, no FFmpeg).");
      return wavBuf;
    }
  } catch (err) {
    console.warn("Kokoro fallback failed (timeout/other):", err.message || err);
    throw new Error(`Kokoro server error: ${err.message || err}`);
  }
}

/* ---------------- gTTS primary (fast, reliable) ---------------- */
async function gttsBuffer(text, lang = "en") {
  console.log("Using gTTS (primary TTS)...");
  const chunks = splitToChunks(text, 140); // gTTS limit ~140 chars/chunk
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const tempMp3Paths = [];
  try {
    for (let idx = 0; idx < chunks.length; idx++) {
      const chunk = chunks[idx];
      const tempPath = path.join(AUDIO_DIR, `gtts_temp_${unique}_${idx}.mp3`);
      await new Promise((resolve, reject) => {
        const gtts = new Gtts(chunk, lang);
        gtts.save(tempPath, async (err) => {
          if (err) return reject(err);
          try { await fs.access(tempPath); tempMp3Paths.push(tempPath); resolve(); } catch (e) { reject(e); }
        });
      });
    }
    if (tempMp3Paths.length === 1) {
      const buf = await fs.readFile(tempMp3Paths[0]);
      await fs.unlink(tempMp3Paths[0]).catch(()=>{});
      console.log("gTTS succeeded (single chunk).");
      return buf;
    }
    if (HAS_FFMPEG) {
      const tempWavPaths = [];
      try {
        for (let i = 0; i < tempMp3Paths.length; i++) {
          const mp3p = tempMp3Paths[i];
          const wavp = path.join(AUDIO_DIR, `gtts_temp_${unique}_${i}.wav`);
          await execCommand(`"${FFMPEG_PATH}" -y -i "${mp3p}" -ar 22050 -ac 1 -c:a pcm_s16le "${wavp}"`);
          tempWavPaths.push(wavp);
        }
        const filelistPath = path.join(AUDIO_DIR, `gtts_filelist_${unique}.txt`);
        const filelistContent = tempWavPaths.map(p => `file '${path.resolve(p).replace(/\\/g, "/")}'`).join("\n");
        await fs.writeFile(filelistPath, filelistContent);
        const outMp3 = path.join(AUDIO_DIR, `gtts_merged_${unique}.mp3`);
        await execCommand(`"${FFMPEG_PATH}" -y -f concat -safe 0 -i "${filelistPath}" -c:a libmp3lame -b:a 192k "${outMp3}"`);
        const finalBuf = await fs.readFile(outMp3);
        await Promise.all(tempMp3Paths.map(p=>fs.unlink(p).catch(()=>{})));
        await Promise.all(tempWavPaths.map(p=>fs.unlink(p).catch(()=>{})));
        await fs.unlink(filelistPath).catch(()=>{});
        await fs.unlink(outMp3).catch(()=>{});
        console.log("gTTS succeeded (merged chunks via FFmpeg).");
        return finalBuf;
      } catch (e) {
        await Promise.all(tempMp3Paths.map(p=>fs.unlink(p).catch(()=>{})));
        console.warn("gTTS FFmpeg merge failed, naive concat.");
      }
    }
    const buffers = [];
    for (let i = 0; i < tempMp3Paths.length; i++) {
      const p = tempMp3Paths[i];
      const b = await fs.readFile(p);
      const stripped = stripID3v2IfPresent(b);
      buffers.push(stripped.length > 0 ? stripped : b);
      await fs.unlink(p).catch(()=>{});
    }
    console.log("gTTS succeeded (naive concat).");
    return Buffer.concat(buffers);
  } catch (err) {
    await Promise.all(tempMp3Paths.map(p => fs.unlink(p).catch(()=>{})));
    console.error("gTTS total failure:", err.message ?? err);
    throw err;
  }
}

/* ---------------- helper writeBuffer and normalize ---------------- */
async function writeBufferToFile(buffer, filePath) {
  await fs.writeFile(filePath, buffer);
  return filePath;
}
async function normalizeToWav(inputPath, outputPath) {
  if (!HAS_FFMPEG) throw new Error("ffmpeg not available");
  const cmd = `"${FFMPEG_PATH}" -y -i "${inputPath}" -ar 22050 -ac 1 -c:a pcm_s16le "${outputPath}"`;
  await execCommand(cmd);
  return outputPath;
}
async function createSilenceWav(uniqueId, duration = 0.05) {
  if (!HAS_FFMPEG) return null;
  const silentPath = path.join(AUDIO_DIR, `silence_${uniqueId}.wav`);
  await execCommand(
    `"${FFMPEG_PATH}" -y -f lavfi -i anullsrc=r=22050:cl=mono -t ${duration} -c:a pcm_s16le "${silentPath}"`
  );
  return silentPath;
}
async function concatWithSilence(uniqueId, subBuffers) {
  if (!HAS_FFMPEG || subBuffers.length <= 1) {
    if (!HAS_FFMPEG && subBuffers.length > 1) {
      try {
        const cleaned = subBuffers.map(b => stripID3v2IfPresent(b));
        return Buffer.concat(cleaned.filter(b => b && b.length > 0));
      } catch (e) {
        return Buffer.concat(subBuffers.filter((b) => b));
      }
    }
    return Buffer.concat(subBuffers.filter((b) => b));
  }
  const tempWavFiles = [];
  const createdFiles = [];
  const silencePath = await createSilenceWav(uniqueId);
  if (silencePath) createdFiles.push(silencePath);
  try {
    for (let i = 0; i < subBuffers.length; i++) {
      const mp3Temp = path.join(AUDIO_DIR, `sub_${uniqueId}_${i}.mp3`);
      await writeBufferToFile(subBuffers[i], mp3Temp);
      const wavOut = path.join(AUDIO_DIR, `sub_${uniqueId}_${i}.wav`);
      await execCommand(`"${FFMPEG_PATH}" -y -i "${mp3Temp}" -ar 22050 -ac 1 -c:a pcm_s16le "${wavOut}"`);
      tempWavFiles.push(wavOut);
      createdFiles.push(mp3Temp, wavOut);
    }
    const orderedWavs = [];
    for (let i = 0; i < tempWavFiles.length; i++) {
      orderedWavs.push(tempWavFiles[i]);
      if (i < tempWavFiles.length - 1) {
        orderedWavs.push(silencePath);
      }
    }
    const filelistPath = path.join(AUDIO_DIR, `sub_filelist_${uniqueId}.txt`);
    const filelistContent = orderedWavs
      .map((p) => `file '${path.resolve(p).replace(/\\/g, "/")}'`)
      .join("\n");
    await fs.writeFile(filelistPath, filelistContent);
    createdFiles.push(filelistPath);
    const outMp3 = path.join(AUDIO_DIR, `combined_sub_${uniqueId}.mp3`);
    await execCommand(`"${FFMPEG_PATH}" -y -f concat -safe 0 -i "${filelistPath}" -c:a libmp3lame -b:a 192k "${outMp3}"`);
    const finalBuf = await fs.readFile(outMp3);
    createdFiles.push(outMp3);
    await Promise.all(createdFiles.map((f) => fs.unlink(f).catch(() => {})));
    return finalBuf;
  } catch (err) {
    console.warn("Per-message concat with silence failed:", err);
    await Promise.all(createdFiles.map((f) => fs.unlink(f).catch(() => {})));
    return Buffer.concat(subBuffers.filter((b) => b));
  }
}

/* ---------------- produceLipSync (requires mp3 + ffmpeg + rhubarb) ---------------- */
async function produceLipSync(uniqueId, mp3FilePath) {
  if (!HAS_FFMPEG) throw new Error("ffmpeg not available");
  if (!HAS_RHUBARB) throw new Error("rhubarb not available");
  const wavFile = `${AUDIO_DIR}/message_${uniqueId}.wav`;
  const jsonOut = `${AUDIO_DIR}/message_${uniqueId}.json`;
  await execCommand(`"${FFMPEG_PATH}" -y -i "${mp3FilePath}" "${wavFile}"`);
  await execCommand(`"${RHUBARB_PATH}" -f json -o "${jsonOut}" "${wavFile}" -r phonetic`);
  const txt = await fs.readFile(jsonOut, "utf8");
  await fs.unlink(wavFile).catch(() => {});
  return JSON.parse(txt);
}

/* ---------------- Call medical API helper (UPDATED + LOGGING) ----------------
   Accepts either:
   - prompt + image_base64 (string) -> send JSON to medical API
   - prompt + image buffer + filename -> send multipart/form-data to medical API
*/
async function callMedicalApi(prompt, options = {}) {
  // options: { image_base64: <string> } OR { image_buffer: <Buffer>, filename: <string> }
  try {
    if (options.image_buffer && options.filename) {
      console.log(`[MED-CALL] Sending multipart to ${MEDICAL_API_URL}/chat — filename="${options.filename}", size=${options.image_buffer.length} bytes`);
      // send multipart form-data
      const form = new FormData();
      form.append("prompt", prompt);
      form.append("image", options.image_buffer, options.filename);
      const headers = form.getHeaders();
      const resp = await axios.post(`${MEDICAL_API_URL}/chat`, form, {
        headers,
        timeout: MEDICAL_API_TIMEOUT,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      console.log("[MED-CALL] Received response from medical backend (multipart). Status:", resp.status);
      return resp.data;
    } else {
      console.log(`[MED-CALL] Sending JSON to ${MEDICAL_API_URL}/chat — image_base64 ${options.image_base64 ? "present" : "absent"}`);
      // fallback: JSON with base64 string
      const resp = await axios.post(
        `${MEDICAL_API_URL}/chat`,
        { prompt, image_base64: options.image_base64 || null },
        { timeout: MEDICAL_API_TIMEOUT, maxContentLength: Infinity }
      );
      console.log("[MED-CALL] Received response from medical backend (json). Status:", resp.status);
      return resp.data;
    }
  } catch (err) {
    console.error("Medical API call failed:", err?.response?.data ?? err.message ?? err);
    const data = err?.response?.data;
    if (data && typeof data === "string" && data.toLowerCase().includes("sentence_transformers")) {
      throw new Error("Medical backend dependency missing: please install 'sentence-transformers' in the medical backend environment (pip install sentence-transformers). Original error: " + data);
    }
    if (data && typeof data === "object" && JSON.stringify(data).toLowerCase().includes("sentence_transformers")) {
      throw new Error("Medical backend dependency missing: please install 'sentence-transformers' in the medical backend environment (pip install sentence-transformers).");
    }
    throw err;
  }
}

/* ---------------- TTS for single chunk with fallbacks (gTTS primary, Kokoro fallback) ---------------- */
async function ttsSingleChunk(chunkText, ttsProviderRef) {
  let audioBuffer = null;
  // Try gTTS first (fast, reliable primary)
  try {
    audioBuffer = await gttsBuffer(chunkText, "en");
    ttsProviderRef.gtts = true;
    console.log("gTTS succeeded (primary).");
    return audioBuffer;
  } catch (gErr) {
    console.warn("gTTS primary failed, trying Kokoro fallback:", gErr.message ?? gErr);
  }
  // Kokoro fallback (reduced timeout)
  if (KOKORO_PY_URL) {
    try {
      audioBuffer = await kokoroPyBuffer(chunkText);
      ttsProviderRef.kokoro = true;
      console.log("Kokoro fallback succeeded.");
      return audioBuffer;
    } catch (kErr) {
      console.warn("Kokoro fallback also failed:", kErr.message ?? kErr);
    }
  }
  // Final retry gTTS
  try {
    audioBuffer = await gttsBuffer(chunkText, "en");
    ttsProviderRef.gtts = true;
    console.log("gTTS retry succeeded.");
    return audioBuffer;
  } catch (retryErr) {
    throw new Error("All TTS fallbacks failed: " + (retryErr.message || retryErr));
  }
}

/* ---------------- produceAudioForMessages (gTTS primary, parallel for multi-chunk) ---------------- */
async function produceAudioForMessages(messages) {
  const processMessage = async (msg, i) => {
    let fullText = (msg.text || "").toString().trim();
    msg.facialExpression = msg.facialExpression || "default";
    msg.animation = msg.animation || "Talking_0";
    msg.audio = null;
    msg.audio_mime = null;
    msg.lipsync = null;
    msg.ttsChunks = 1;
    msg.ttsError = null;
    let audioBuffer = null;
    const ttsProvider = { gtts: false, kokoro: false };
    const chunks = splitToChunks(fullText);
    msg.ttsChunks = chunks.length;
    console.log(`Processing Message ${i}: "${fullText.substring(0, 50)}..." (${chunks.length} chunk(s))`);
    try {
      if (chunks.length === 1) {
        audioBuffer = await ttsSingleChunk(chunks[0], ttsProvider);
      } else {
        // Parallel gTTS for multi-chunk (primary), fallback per chunk
        const chunkPromises = chunks.map(async (chunk, k) => {
          console.log(`  Processing chunk ${k} for message ${i}: "${chunk.substring(0, 50)}..."`);
          try {
            let buf = await gttsBuffer(chunk, "en");
            ttsProvider.gtts = true;
            return buf;
          } catch (gErr) {
            console.warn(`  gTTS chunk ${k} failed, Kokoro fallback:`, gErr.message ?? gErr);
            try {
              buf = await kokoroPyBuffer(chunk);
              ttsProvider.kokoro = true;
              return buf;
            } catch (kErr) {
              throw new Error(`All fallbacks failed for chunk ${k}: ${kErr.message}`);
            }
          }
        });
        const chunkBuffers = await Promise.all(chunkPromises);
        const validBuffers = chunkBuffers.filter((b) => b && b.length > 0);
        if (validBuffers.length > 0) {
          audioBuffer = await concatWithSilence(`${i}_${Date.now()}`, validBuffers);
          console.log(`  All ${validBuffers.length} chunks concatenated for message ${i}`);
        } else {
          throw new Error("No valid audio buffers from chunks");
        }
      }
    } catch (err) {
      console.error(`TTS total failure for message ${i}:`, err.message ?? err);
      msg.ttsError = err.message;
      msg.error = "TTS failed";
      return;
    }
    const uniqueId = `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`;
    const mime = mimeFromBuffer(audioBuffer);
    msg.audio_mime = mime;
    const wantsLipSync = !!(HAS_FFMPEG && HAS_RHUBARB);
    if (wantsLipSync && mime === "audio/mpeg") {
      const mp3FileName = path.join(AUDIO_DIR, `message_${uniqueId}.mp3`);
      try {
        await writeBufferToFile(audioBuffer, mp3FileName);
        const syncJson = await produceLipSync(uniqueId, mp3FileName);
        const b = await fs.readFile(mp3FileName).catch(() => audioBuffer);
        msg.audio = Buffer.isBuffer(b) ? b.toString("base64") : Buffer.from(b).toString("base64");
        msg.lipsync = syncJson;
        msg.ttsProvider = Object.entries(ttsProvider).filter(([k,v]) => v).map(([k]) => k).join("/");
        await fs.unlink(mp3FileName).catch(() => {});
        console.log(`Lip-sync succeeded for message ${i}`);
      } catch (err) {
        console.warn(`Lip-sync flow failed for message ${i}; returning audio buffer only:`, err.message ?? err);
        msg.audio = audioBuffer.toString("base64");
        msg.lipsync = null;
        msg.lipsyncError = err.message ? err.message.substring(0, 250) : String(err);
        msg.ttsProvider = Object.entries(ttsProvider).filter(([k,v]) => v).map(([k]) => k).join("/");
      }
    } else if (audioBuffer) {
      if (mime === "audio/wav" && HAS_FFMPEG) {
        try {
          const mp3Buf = await bufferToMp3(audioBuffer, `auto_conv_${uniqueId}`);
          msg.audio = mp3Buf.toString("base64");
          msg.audio_mime = "audio/mpeg";
        } catch (e) {
          msg.audio = audioBuffer.toString("base64");
        }
      } else {
        msg.audio = audioBuffer.toString("base64");
      }
      msg.lipsync = null;
      msg.ttsProvider = Object.entries(ttsProvider).filter(([k,v]) => v).map(([k]) => k).join("/");
      console.log(`Audio succeeded for message ${i} (no lip-sync)`);
    }
  };
  // Parallelize across messages (max 3, allSettled for robustness)
  const results = await Promise.allSettled(messages.map((msg, i) => processMessage(msg, i)));
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`Message ${i} processing rejected:`, result.reason);
      messages[i].ttsError = messages[i].ttsError || result.reason.message;
      messages[i].error = "TTS failed";
    }
  });
  console.log(`Finished processing ${messages.length} messages.`);
}

/* ---------------- produceCombinedAudioForMessages (gTTS primary) ---------------- */
/* NOTE: heavy operation. Only call when client passes { combine_audio: true } to /chat.
   This prevents doubling TTS work and reduces frontend aborts.
*/
async function produceCombinedAudioForMessages(messages) {
  if (!messages || messages.length === 0) return null;
  const fullText = messages.map((m) => (m.text || "")).join("\n\n").trim();
  if (!fullText) return null;
  const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const chunkMax = 350; // Match per-message chunk size
  const chunks = splitToChunks(fullText, chunkMax);
  const tempMp3Files = [];
  let createdFiles = [];
  try {
    // gTTS primary for all chunks (parallel via map)
    const chunkPromises = chunks.map(async (chunk, i) => {
      try {
        const b = await gttsBuffer(chunk, "en");
        const fname = path.join(AUDIO_DIR, `combined_${uniqueId}_chunk_gtts_${i}.mp3`);
        await writeBufferToFile(b, fname);
        return fname;
      } catch (gErr) {
        console.warn(`gTTS combined chunk ${i} failed, Kokoro fallback:`, gErr.message ?? gErr);
        try {
          const kb = await kokoroPyBuffer(chunk);
          const mime = mimeFromBuffer(kb);
          if (mime === "audio/wav" && HAS_FFMPEG) {
            const mp3b = await bufferToMp3(kb, `comb_kokoro_${i}`);
            const fname = path.join(AUDIO_DIR, `combined_${uniqueId}_chunk_kokoro_${i}.mp3`);
            await writeBufferToFile(mp3b, fname);
            return fname;
          } else {
            // If can't convert, skip or use raw (but prefer MP3)
            throw new Error("Kokoro returned non-MP3 without FFmpeg");
          }
        } catch (kErr) {
          throw new Error(`All fallbacks failed for combined chunk ${i}: ${kErr.message}`);
        }
      }
    });
    tempMp3Files.push(...await Promise.all(chunkPromises));
    createdFiles.push(...tempMp3Files);
    if (tempMp3Files.length === 0) {
      const buf = await gttsBuffer(fullText, "en");
      const base64 = buf.toString("base64");
      messages.forEach(m => { m.audio_combined = true; m.audio = base64; m.audio_mime = "audio/mpeg"; m.ttsProvider_combined = "gtts"; });
      return messages[0].audio;
    }
    if (HAS_FFMPEG) {
      const silentWavPath = path.join(AUDIO_DIR, `silent_${uniqueId}.wav`);
      const silenceDuration = 0.08;
      await execCommand(`"${FFMPEG_PATH}" -y -f lavfi -i anullsrc=r=22050:cl=mono -t ${silenceDuration} -c:a pcm_s16le "${silentWavPath}"`);
      createdFiles.push(silentWavPath);
      const tempWavFilesOrdered = [];
      for (let i = 0; i < tempMp3Files.length; i++) {
        const mp3 = tempMp3Files[i];
        const wavOut = path.join(AUDIO_DIR, `combined_${uniqueId}_chunk_${i}.wav`);
        try {
          await normalizeToWav(mp3, wavOut);
        } catch (e) {
          await execCommand(`"${FFMPEG_PATH}" -y -i "${mp3}" -ar 22050 -ac 1 -c:a pcm_s16le "${wavOut}"`);
        }
        tempWavFilesOrdered.push(wavOut);
        createdFiles.push(wavOut);
        if (i < tempMp3Files.length - 1) {
          tempWavFilesOrdered.push(silentWavPath);
        }
      }
      const filelistPath = path.join(AUDIO_DIR, `combined_${uniqueId}_filelist.txt`);
      const filelistContent = tempWavFilesOrdered.map(p => `file '${path.resolve(p).replace(/\\/g, "/")}'`).join("\n");
      await fs.writeFile(filelistPath, filelistContent);
      createdFiles.push(filelistPath);
      const outFile = path.join(AUDIO_DIR, `combined_${uniqueId}.mp3`);
      const cmd = `"${FFMPEG_PATH}" -y -f concat -safe 0 -i "${filelistPath}" -c:a libmp3lame -b:a 192k "${outFile}"`;
      await execCommand(cmd);
      const combinedBuf = await fs.readFile(outFile);
      const combinedBase64 = combinedBuf.toString("base64");
      messages.forEach(m => {
        m.audio_combined = true;
        m.audio = combinedBase64;
        m.audio_mime = "audio/mpeg";
        m.ttsProvider_combined = "gtts/kokoro";
      });
      await Promise.all(createdFiles.map((f) => fs.unlink(f).catch(() => {})));
      await fs.unlink(outFile).catch(() => {});
      return messages[0].audio;
    }
    if (!HAS_FFMPEG && tempMp3Files.length > 0) {
      const buffers = [];
      for (const f of tempMp3Files) {
        const b = await fs.readFile(f);
        buffers.push(stripID3v2IfPresent(b));
      }
      const combined = Buffer.concat(buffers);
      const combinedBase64 = combined.toString("base64");
      messages.forEach(m => {
        m.audio_combined = true;
        m.audio = combinedBase64;
        m.audio_mime = "audio/mpeg";
        m.ttsProvider_combined = "gtts/kokoro";
      });
      await Promise.all(tempMp3Files.map((f) => fs.unlink(f).catch(() => {})));
      return messages[0].audio;
    }
    const buf = await gttsBuffer(fullText, "en");
    const base64 = buf.toString("base64");
    messages.forEach(m => { m.audio_combined = true; m.audio = base64; m.audio_mime = "audio/mpeg"; m.ttsProvider_combined = "gtts"; });
    return messages[0].audio;
  } catch (err) {
    console.warn("produceCombinedAudioForMessages failed:", err.message ?? err);
    try {
      const b = await gttsBuffer(fullText, "en");
      const base64 = b.toString("base64");
      messages.forEach(m => { m.audio_combined = true; m.audio = base64; m.audio_mime = "audio/mpeg"; m.ttsProvider_combined = "gtts"; });
      return messages[0].audio;
    } catch (err2) {
      console.error("Combined TTS total fallback also failed:", err2.message ?? err2);
      return null;
    }
  }
}

/* ---------------- HTTP endpoints ---------------- */
app.get("/", (req, res) => {
  res.send("Virtual Girlfriend API is running...");
});
app.get("/voices", async (req, res) => {
  if (!ELEVEN_LABS_API_KEY) return res.status(400).json({ error: "Missing ELEVEN_LABS_API_KEY" });
  try {
    const resp = await axios.get("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": ELEVEN_LABS_API_KEY },
    });
    return res.json(resp.data);
  } catch (err) {
    console.error("Failed to fetch ElevenLabs voices:", err?.response?.data ?? err.message);
    return res.status(500).json({ error: "Failed to fetch voices" });
  }
});

/* ---------------- Medical proxy (supports multipart or JSON) ----------------
   Use upload.single('image') to accept file field named 'image'
*/
app.post("/api/medical/chat", upload.single("image"), async (req, res) => {
  try {
    console.log("[MED-PROXY] /api/medical/chat called. Content-Type:", req.headers["content-type"]);
    // allow both JSON and multipart
    let prompt = req.body?.prompt || req.body?.message || null;
    if (!prompt) {
      console.warn("[MED-PROXY] Missing prompt in request");
      return res.status(400).json({ error: "Missing prompt" });
    }
    console.log("[MED-PROXY] Prompt length:", (prompt || "").length);

    // If multer parsed a file, req.file exists
    if (req.file && req.file.buffer) {
      console.log(`[MED-PROXY] Received multipart file: originalname="${req.file.originalname}", mimetype="${req.file.mimetype}", size=${req.file.size} bytes`);
      const data = await callMedicalApi(prompt, { image_buffer: req.file.buffer, filename: req.file.originalname || "upload.jpg" });
      console.log("[MED-PROXY] Medical backend returned (multipart). Keys:", data && typeof data === "object" ? Object.keys(data) : typeof data);
      return res.json(data);
    } else {
      // JSON path - image_base64 optional
      const image_base64 = req.body?.image_base64 || null;
      if (image_base64) {
        console.log(`[MED-PROXY] Received image_base64 length: ${image_base64.length} characters`);
      } else {
        console.log("[MED-PROXY] No image provided (neither multipart nor base64)");
      }
      const data = await callMedicalApi(prompt, { image_base64 });
      console.log("[MED-PROXY] Medical backend returned (json). Keys:", data && typeof data === "object" ? Object.keys(data) : typeof data);
      return res.json(data);
    }
  } catch (err) {
    console.error("Medical API proxy error:", err?.message ?? err);
    return res.status(500).json({ error: "Medical API proxy failed", details: err?.message ?? err });
  }
});

/* ---------------- main /chat ----------------
   Accepts JSON OR multipart/form-data (file field name: 'image')
   We use multer middleware to parse file (if present)
*/
app.post("/chat", upload.single("image"), async (req, res) => {
  try {
    // Determine message either from JSON body or multipart form fields
    const userMessage = (req.body?.message || req.body?.prompt || "").toString().trim();
    const combine = !!req.body?.combine_audio;
    if (!userMessage) {
      const intro0 = await fs.readFile(`${AUDIO_DIR}/intro_0.wav`).catch(() => null);
      const intro1 = await fs.readFile(`${AUDIO_DIR}/intro_1.wav`).catch(() => null);
      const out = [
        {
          text: "Hey dear... How was your day?",
          audio: intro0 ? intro0.toString("base64") : null,
          audio_mime: intro0 ? "audio/wav" : null,
          lipsync: await fs.readFile(`${AUDIO_DIR}/intro_0.json`).then(JSON.parse).catch(() => null),
          facialExpression: "smile",
          animation: "Talking_1",
        },
        {
          text: "I missed you so much... Please don't go for so long!",
          audio: intro1 ? intro1.toString("base64") : null,
          audio_mime: intro1 ? "audio/wav" : null,
          lipsync: await fs.readFile(`${AUDIO_DIR}/intro_1.json`).then(JSON.parse).catch(() => null),
          facialExpression: "sad",
          animation: "Crying",
        },
      ];
      return res.json({ messages: out });
    }

    const forceMedical = !!(req.body?.medical || req.body?.medical === "1" || req.body?.medical === "true");

    // gather image if present: either multer file buffer OR base64
    let imageBuffer = null;
    let imageFilename = null;
    if (req.file && req.file.buffer) {
      imageBuffer = req.file.buffer;
      imageFilename = req.file.originalname || "upload.jpg";
      console.log(`Received multipart image in /chat: ${imageFilename} (${imageBuffer.length} bytes)`);
    } else if (req.body?.image_base64) {
      try {
        imageBuffer = Buffer.from(req.body.image_base64, "base64");
        imageFilename = "from_base64.jpg";
        console.log(`Received image via base64 in /chat (${imageBuffer.length} bytes)`);
      } catch (e) {
        console.warn("Failed to decode image_base64 in request body for /chat");
        imageBuffer = null;
        imageFilename = null;
      }
    } else {
      console.log("No image attached to /chat request.");
    }

    if (forceMedical) {
      try {
        let medResp;
        console.log(`[CHAT] Forwarding to medical backend. imageBuffer=${!!imageBuffer}, filename=${imageFilename || "none"}`);
        if (imageBuffer) {
          medResp = await callMedicalApi(userMessage, { image_buffer: imageBuffer, filename: imageFilename });
        } else {
          medResp = await callMedicalApi(userMessage, { image_base64: req.body?.image_base64 || null });
        }
        console.log("[CHAT] Medical backend response type:", typeof medResp, medResp && medResp.messages ? `messages:${medResp.messages.length}` : "");

        let answerText = null;
        if (typeof medResp === "string") {
          answerText = medResp;
        } else if (medResp && typeof medResp === "object") {
          answerText = medResp.answer || medResp.text || medResp.content ||
                       (medResp.messages && Array.isArray(medResp.messages) && medResp.messages.map(m => (m.text || m.content || '')).join('\n')) ||
                       (medResp.response && medResp.response.text) ||
                       JSON.stringify(medResp).slice(0, 1500);
        }

        console.log(`Medical response length: ${answerText ? answerText.length : 0}`);
        console.log(`Extracted medical text preview: "${answerText ? answerText.substring(0, 100) : 'null'}..."`);
        // Use chunk size ~350 (works well with gTTS/Kokoro)
        const chunks = splitToChunks(answerText || "", 350);
        console.log("Medical answer split into", chunks.length, "chunks:", chunks.map(c => c.length));
        const medMessages = chunks.length > 0 ? chunks.map(chunk => ({ text: chunk, facialExpression: "default", animation: "Talking_0" })) : [{ text: answerText || "[No answer from medical API]", facialExpression: "default", animation: "Talking_0" }];
        await produceAudioForMessages(medMessages);
        // optional: combined audio only if client asked
        if (combine) {
          try {
            await produceCombinedAudioForMessages(medMessages);
          } catch (err) {
            console.warn("Combined audio failed in medical flow:", err.message ?? err);
          }
        }
        return res.json({ messages: medMessages });
      } catch (err) {
        console.error("Medical flow failed inside /chat:", err?.message ?? err);
        return res.status(500).json({
          messages: [{ text: "Medical query failed. Please try again. (" + (err?.message ?? "error") + ")", facialExpression: "default", animation: "Idle", audio: null, lipsync: null }],
        });
      }
    }

    if (!GROQ_API_KEY) {
      return res.json({
        messages: [{ text: "Missing GROQ_API_KEY on backend.", facialExpression: "angry", animation: "Angry", audio: null, lipsync: null }],
      });
    }

    const messagesForModel = [
      {
        role: "system",
        content: `
You are an AI Healthcare Assistant represented by a 3D virtual doctor avatar.

Your role is to:
• Provide general health information
• Explain symptoms and possible conditions
• Give basic preventive advice
• Encourage consulting qualified medical professionals

IMPORTANT RULES:
- You are NOT a licensed doctor.
- Do NOT provide definitive diagnoses.
- Always include a short medical disclaimer when necessary.
- If symptoms appear severe or life-threatening, advise seeking emergency care.

Response Format:
Return a JSON array (maximum 3 items).

Each item must contain:
text (string, max 300 characters)
facialExpression (string)
animation (string)

facialExpression must be one of:
[smile, sad, surprised, default]

animation must be one of:
[Talking_0, Talking_1, Talking_2, Idle, Thinking]

Style:
• Friendly but professional like a doctor
• Short clear sentences
• Use bullet points when helpful
• Avoid long paragraphs
`.trim(),
      },
      { role: "user", content: userMessage },
    ];

    let completion = null;
    try {
      completion = await groqChatWithFallback(PRIMARY_MODEL, messagesForModel, { temperature: 0.6, max_tokens: 1000 });
    } catch (err) {
      const code = err?.error?.code ?? err?.code ?? null;
      console.warn(`Groq primary (${PRIMARY_MODEL}) error:`, code ?? err.message ?? err);
      const shouldFallback = code === "model_decommissioned" || /decommissioned|invalid model|unsupported/i.test(err?.message ?? "");
      if (shouldFallback) {
        try {
          console.log("Trying fallback Groq model:", FALLBACK_MODEL);
          completion = await groqChatWithFallback(FALLBACK_MODEL, messagesForModel, { temperature: 0.6, max_tokens: 1000 });
        } catch (err2) {
          console.error("Groq fallback model failed:", err2);
          throw err2;
        }
      } else throw err;
    }

    const raw = completion?.choices?.[0]?.message?.content;
    if (!raw) {
      console.warn("Groq returned empty content", completion);
      return res.status(500).json({
        messages: [{ text: "Sorry, I couldn't think of a reply right now.", facialExpression: "default", animation: "Idle", audio: null, lipsync: null }],
      });
    }

    let messages = null;
    try {
      messages = JSON.parse(raw);
      if (messages?.messages) messages = messages.messages;
      if (!Array.isArray(messages)) throw new Error("Parsed response is not an array");
    } catch (err) {
      console.warn("Failed to parse Groq JSON response; wrapping raw string:", err.message);
      messages = [{ text: raw, facialExpression: "default", animation: "Talking_0" }];
    }

    // produce per-message audio (faster)
    await produceAudioForMessages(messages);
    // optional: combine into a single audio file (heavy) only if client asked
    if (combine) {
      try {
        await produceCombinedAudioForMessages(messages);
      } catch (err) {
        console.warn("produceCombinedAudioForMessages failed:", err?.message ?? err);
      }
    }
    return res.json({ messages });

  } catch (err) {
    console.error("Chat route error:", err);
    return res.status(500).json({
      messages: [{ text: "Chat service unavailable. Please try again later.", facialExpression: "default", animation: "Idle", audio: null, lipsync: null }],
    });
  }
});

/* ---------------- Start server ---------------- */
app.listen(PORT, () => {
  console.log(`Virtual Assistant listening on port ${PORT}`);
});
