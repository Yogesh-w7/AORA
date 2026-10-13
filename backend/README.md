<!-- # Virtual Girlfriend Backend

This is the backend service for the Virtual Girlfriend application. It handles chat interactions, audio generation, and lip-syncing for the virtual avatar.

## Features

- **Chat Integration**: Uses OpenAI's GPT-3.5-turbo for generating conversational responses.
- **Text-to-Speech**: Converts text responses into audio using the ElevenLabs API.
- **Lip-Syncing**: Generates lip-sync data for the avatar using Rhubarb Lip Sync.
- **Facial Expressions and Animations**: Supports dynamic facial expressions and animations for the avatar.

## Prerequisites

- Node.js (v16 or higher)
- API keys for:
  - OpenAI
  - ElevenLabs
- Ensure `ffmpeg` and `rhubarb` are installed and available in your system's PATH.

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-repo/virtual-girlfriend.git
   cd virtual-girlfriend/backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the backend directory and add the following:
   ```env
   OPENAI_API_KEY=your_openai_api_key
   ELEVEN_LABS_API_KEY=your_elevenlabs_api_key
   ```

## Usage

### Start the backend server:
   ```bash
   npm run dev
   ```
The server will run on `http://localhost:3000`.

## API Endpoints

### `GET /`
Returns a simple "Hello World!" message.

### `GET /voices`
Fetches available voices from the ElevenLabs API.

### `POST /chat`
Handles chat requests. Accepts a JSON payload:
```json
{
  "message": "Hello!",
  "user_id": "12345"
}
```

Returns a JSON response with text, audio, lip-sync data, facial expressions, and animations.

## Development
Use `nodemon` for hot-reloading during development:
   ```bash
   npm install -g nodemon
   nodemon index.js
   ```

## License
This project is licensed under the MIT License.

idex.js
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
dotenv.config();

/* ---------------- Configuration ---------------- */
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const ELEVEN_LABS_API_KEY_ORIG = process.env.ELEVEN_LABS_API_KEY || "";
let ELEVEN_LABS_API_KEY = (ELEVEN_LABS_API_KEY_ORIG || "").trim();
const ELEVEN_VOICE_ID = (process.env.ELEVEN_VOICE_ID || "Xb7hH8MSUJpSbSDYk0k2").trim();
const PORT = parseInt(process.env.PORT || "3000", 10);

const PRIMARY_MODEL = process.env.PRIMARY_MODEL || process.env.GROQ_PRIMARY_MODEL || "llama-3.1-8b-instant";
const FALLBACK_MODEL = process.env.FALLBACK_MODEL || process.env.GROQ_FALLBACK_MODEL || "mixtral-8x7b-32768";

const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg"; // prefer on PATH if not specified
let RHUBARB_PATH = process.env.RHUBARB_PATH || "rhubarb";
const AUDIO_DIR = "audios";

const MEDICAL_API_URL = process.env.MEDICAL_API_URL || "http://127.0.0.1:8001";
const MEDICAL_API_TIMEOUT = parseInt(process.env.MEDICAL_API_TIMEOUT || "120000", 10); // ms
const KOKORO_PY_URL = process.env.KOKORO_PY_URL || "http://127.0.0.1:5002/tts";
const KOKORO_TIMEOUT = parseInt(process.env.KOKORO_TIMEOUT || "30000", 10); // per-request kokoro timeout (ms)

const ELEVEN_CONCURRENCY = parseInt(process.env.ELEVEN_CONCURRENCY || "2", 10);
const KOKORO_CONCURRENCY = parseInt(process.env.KOKORO_CONCURRENCY || "3", 10); // parallel kokoro chunk workers

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

/* ---------------- Setup express ---------------- */
const app = express();
app.use(express.json({ limit: "12mb" }));
app.use(cors());

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
  const maxRetries = 4;
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
          timeout: 60000,
        }
      );
      return Buffer.from(resp.data);
    } catch (err) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      const bodyStr = body ? JSON.stringify(body).toLowerCase() : "";
      const tooMany = status === 429 || bodyStr.includes("too_many") || bodyStr.includes("concurrent");

      if (status === 401 || (bodyStr && bodyStr.includes("unauthoriz"))) {
        ELEVEN_ENABLED = false;
        console.warn("ElevenLabs returned 401/unauthorized — disabling Eleven in this process. Check ELEVEN_LABS_API_KEY.");
        throw new Error(`ElevenLabs TTS unauthorized (status ${status}). Key disabled for this run.`);
      }

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
  if (!ELEVEN_ENABLED) throw new Error("ElevenLabs disabled (invalid key or disabled after error).");
  return elevenSemaphore.use(() => elevenTTSToBuffer(apiKey, voiceId, text));
}

/* ---------------- Splitters ---------------- */
function splitToChunks(text, maxLen = 1200) {
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

/* ---------------- Kokoro Python wrapper ----------------
   Expects kokoro_server.py POST /tts -> { audio_base64, sample_rate }
*/
async function kokoroPyBuffer(text, voice = "af_heart", speed = 1.0) {
  if (!text || !text.trim()) throw new Error("Empty text for Kokoro");
  try {
    const resp = await axios.post(
      KOKORO_PY_URL,
      { text, voice, speed },
      { timeout: KOKORO_TIMEOUT }
    );
    if (!resp.data || !resp.data.audio_base64) throw new Error("Invalid response from Kokoro server");
    const wavBuf = Buffer.from(resp.data.audio_base64, "base64");
    if (HAS_FFMPEG) {
      try {
        const mp3Buf = await bufferToMp3(wavBuf, "kokoro");
        return mp3Buf;
      } catch (e) {
        return wavBuf;
      }
    } else {
      return wavBuf;
    }
  } catch (err) {
    throw new Error(`Kokoro server error: ${err.message || err}`);
  }
}

/* ---------------- gTTS fallback ---------------- */
async function gttsBuffer(text, lang = "en") {
  const chunks = splitToChunks(text, 140);
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
        return finalBuf;
      } catch (e) {
        await Promise.all(tempMp3Paths.map(p=>fs.unlink(p).catch(()=>{})));
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
    return Buffer.concat(buffers);
  } catch (err) {
    await Promise.all(tempMp3Paths.map(p => fs.unlink(p).catch(()=>{})));
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

/* ---------------- Call medical API helper ---------------- */
async function callMedicalApi(prompt, imageBase64 = null) {
  try {
    const resp = await axios.post(`${MEDICAL_API_URL}/chat`, { prompt, image_base64: imageBase64 }, { timeout: MEDICAL_API_TIMEOUT });
    return resp.data;
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

/* ---------------- New: parallel chunk processing helper ----------------
   Tries Eleven for all chunks (honors elevenSemaphore).
   For remaining chunks runs KOKORO_CONCURRENCY workers calling kokoroPyBuffer,
   and if kokoro returns wav & no ffmpeg -> fallback to gTTS.
   Finally, gTTS any remaining failed chunks.
*/
async function synthesizeChunksParallel(chunks) {
  const n = chunks.length;
  const results = new Array(n).fill(null);

  // 1) Try Eleven in parallel (but respect semaphore)
  if (ELEVEN_LABS_API_KEY && ELEVEN_ENABLED) {
    const promises = chunks.map(async (c, idx) => {
      try {
        const buf = await limitedElevenTTS(ELEVEN_LABS_API_KEY, ELEVEN_VOICE_ID, c);
        results[idx] = buf;
      } catch (e) {
        // leave null for fallback
      }
    });
    await Promise.allSettled(promises);
  }

  // 2) Kokoro workers for missing chunks (concurrent)
  let nextIdx = 0;
  const workers = Array.from({ length: Math.max(1, KOKORO_CONCURRENCY) }).map(async () => {
    while (true) {
      const idx = nextIdx++;
      if (idx >= n) break;
      if (results[idx]) continue;
      try {
        const b = await kokoroPyBuffer(chunks[idx]);
        const mime = mimeFromBuffer(b);
        if (mime === "audio/wav" && !HAS_FFMPEG) {
          // can't convert -> use gTTS to ensure mp3
          try {
            results[idx] = await gttsBuffer(chunks[idx], "en");
          } catch (gErr) {
            results[idx] = null;
          }
        } else if (mime === "audio/wav" && HAS_FFMPEG) {
          try {
            results[idx] = await bufferToMp3(b, `kokoro_chunk_${idx}`);
          } catch (convErr) {
            // fallback to raw WAV if conversion fails
            results[idx] = b;
          }
        } else {
          results[idx] = b;
        }
      } catch (kErr) {
        // kokoro failed -> try gTTS for the chunk
        try {
          results[idx] = await gttsBuffer(chunks[idx], "en");
        } catch (gErr2) {
          results[idx] = null;
        }
      }
    }
  });

  await Promise.allSettled(workers);

  // 3) Final sweep: any null -> gTTS
  for (let i = 0; i < n; i++) {
    if (!results[i] || (Buffer.isBuffer(results[i]) && results[i].length === 0)) {
      try {
        results[i] = await gttsBuffer(chunks[i], "en");
      } catch (err) {
        results[i] = null;
      }
    }
  }

  return results;
}

/* ---------------- produceAudioForMessages (Eleven -> Kokoro(Py) -> gTTS) ---------------- */
async function produceAudioForMessages(messages) {
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    let fullText = (msg.text || "").toString();

    msg.facialExpression = msg.facialExpression || "default";
    msg.animation = msg.animation || "Talking_0";
    msg.audio = null;
    msg.audio_mime = null;
    msg.lipsync = null;
    msg.ttsChunks = 1;
    msg.ttsError = null;

    let audioBuffer = null;
    let ttsProvider = null;
    // Use smaller chunk size to avoid Kokoro timing out on long single chunk
    const chunks = splitToChunks(fullText, 350);

    msg.ttsChunks = chunks.length;
    console.debug(`Message ${i}: ${chunks.length} chunk(s)`);

    try {
      if (chunks.length === 1) {
        // Single chunk: try Eleven -> Kokoro -> gTTS (sequential)
        if (ELEVEN_LABS_API_KEY && ELEVEN_ENABLED) {
          try {
            audioBuffer = await limitedElevenTTS(ELEVEN_LABS_API_KEY, ELEVEN_VOICE_ID, chunks[0]);
            ttsProvider = "elevenlabs";
          } catch (errEle) {
            console.warn("ElevenLabs single-chunk failed, falling back to Kokoro Py:", errEle.message ?? errEle);
            try {
              const buf = await kokoroPyBuffer(chunks[0]);
              const mime = mimeFromBuffer(buf);
              if (mime === "audio/wav" && !HAS_FFMPEG) {
                audioBuffer = await gttsBuffer(chunks[0], "en");
                ttsProvider = "gtts";
              } else if (mime === "audio/wav" && HAS_FFMPEG) {
                audioBuffer = await bufferToMp3(buf, `kokoro_single_${i}`);
                ttsProvider = "kokoro_py";
              } else {
                audioBuffer = buf;
                ttsProvider = "kokoro_py";
              }
            } catch (kErr) {
              console.warn("Kokoro Py also failed, falling back to gTTS:", kErr.message ?? kErr);
              audioBuffer = await gttsBuffer(chunks[0], "en");
              ttsProvider = "gtts";
            }
          }
        } else {
          try {
            audioBuffer = await kokoroPyBuffer(chunks[0]);
            ttsProvider = "kokoro_py";
          } catch (kErr) {
            console.warn("Kokoro Py failed, falling back to gTTS:", kErr.message ?? kErr);
            audioBuffer = await gttsBuffer(chunks[0], "en");
            ttsProvider = "gtts";
          }
        }
      } else {
        // Multiple chunks: synthesize in parallel (Eleven preferred)
        const chunkBuffers = await synthesizeChunksParallel(chunks);
        const validBuffers = chunkBuffers.filter((b) => b && b.length > 0);
        if (validBuffers.length > 0) {
          audioBuffer = await concatWithSilence(`${i}_${Date.now()}`, validBuffers);
        } else {
          audioBuffer = null;
        }
        // mark provider (best-effort)
        ttsProvider = ELEVEN_LABS_API_KEY && ELEVEN_ENABLED ? "eleven/kokoro/gtts" : "kokoro/gtts";
      }

      // If still empty, final attempt: kokoro full text then gTTS.
      if (!audioBuffer || audioBuffer.length === 0) {
        try {
          const buf = await kokoroPyBuffer(fullText);
          const mime = mimeFromBuffer(buf);
          if (mime === "audio/wav" && !HAS_FFMPEG) {
            audioBuffer = await gttsBuffer(fullText, "en");
            ttsProvider = "gtts";
          } else if (mime === "audio/wav" && HAS_FFMPEG) {
            audioBuffer = await bufferToMp3(buf, "kokoro_final");
            ttsProvider = "kokoro_py";
          } else {
            audioBuffer = buf;
            ttsProvider = "kokoro_py";
          }
        } catch (errK) {
          console.warn("Kokoro Py final fallback failed:", errK.message ?? errK);
          audioBuffer = await gttsBuffer(fullText, "en");
          ttsProvider = "gtts";
        }
      }
    } catch (err) {
      console.error("TTS total failure for message:", err.message ?? err);
      msg.ttsError = err.message;
      msg.error = "TTS failed";
      continue;
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
        msg.ttsProvider = ttsProvider;
        await fs.unlink(mp3FileName).catch(() => {});
      } catch (err) {
        console.warn("Lip-sync flow failed for a message; returning audio buffer only:", err.message ?? err);
        msg.audio = audioBuffer.toString("base64");
        msg.lipsync = null;
        msg.lipsyncError = err.message ? err.message.substring(0, 250) : String(err);
        msg.ttsProvider = ttsProvider;
      }
    } else {
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
      msg.ttsProvider = ttsProvider;
    }
  }
}

/* ---------------- produceCombinedAudioForMessages (Eleven -> KokoroPy -> gTTS) ---------------- */
/* NOTE: heavy operation. Only call when client passes { combine_audio: true } to /chat.
   This prevents doubling TTS work and reduces frontend aborts.
*/
async function produceCombinedAudioForMessages(messages) {
  if (!messages || messages.length === 0) return null;
  const fullText = messages.map((m) => (m.text || "")).join("\n\n").trim();
  if (!fullText) return null;

  const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const chunkMax = 1200;
  const chunks = splitToChunks(fullText, chunkMax);

  const tempMp3Files = [];
  let createdFiles = [];

  try {
    if (ELEVEN_LABS_API_KEY && ELEVEN_ENABLED) {
      for (let i = 0; i < chunks.length; i++) {
        try {
          const buf = await limitedElevenTTS(ELEVEN_LABS_API_KEY, ELEVEN_VOICE_ID, chunks[i]);
          const fname = path.join(AUDIO_DIR, `combined_${uniqueId}_chunk_${i}.mp3`);
          await writeBufferToFile(buf, fname);
          tempMp3Files.push(fname);
          createdFiles.push(fname);
        } catch (errChunk) {
          console.warn("ElevenLabs chunk failed at index", i, "falling back remaining chunks to Kokoro Py/gTTS:", errChunk.message ?? errChunk);
          for (let j = i; j < chunks.length; j++) {
            try {
              const b = await kokoroPyBuffer(chunks[j]);
              const mime = mimeFromBuffer(b);
              if (mime === "audio/wav" && HAS_FFMPEG) {
                const mp3b = await bufferToMp3(b, `comb_kokoro_${j}`);
                const fname2 = path.join(AUDIO_DIR, `combined_${uniqueId}_chunk_kokoro_${j}.mp3`);
                await writeBufferToFile(mp3b, fname2);
                tempMp3Files.push(fname2);
                createdFiles.push(fname2);
              } else if (mime === "audio/wav" && !HAS_FFMPEG) {
                const gb = await gttsBuffer(chunks[j], "en");
                const fname3 = path.join(AUDIO_DIR, `combined_${uniqueId}_chunk_gtts_${j}.mp3`);
                await writeBufferToFile(gb, fname3);
                tempMp3Files.push(fname3);
                createdFiles.push(fname3);
              } else {
                const fname2 = path.join(AUDIO_DIR, `combined_${uniqueId}_chunk_kokoro_${j}.mp3`);
                await writeBufferToFile(b, fname2);
                tempMp3Files.push(fname2);
                createdFiles.push(fname2);
              }
            } catch (kErr) {
              console.warn(`KokoroPy failed for combined chunk ${j}, using gTTS:`, kErr.message ?? kErr);
              const gb = await gttsBuffer(chunks[j], "en");
              const fname3 = path.join(AUDIO_DIR, `combined_${uniqueId}_chunk_gtts_${j}.mp3`);
              await writeBufferToFile(gb, fname3);
              tempMp3Files.push(fname3);
              createdFiles.push(fname3);
            }
          }
          break;
        }
      }
    } else {
      for (let i = 0; i < chunks.length; i++) {
        try {
          const b = await kokoroPyBuffer(chunks[i]);
          const mime = mimeFromBuffer(b);
          if (mime === "audio/wav" && HAS_FFMPEG) {
            const mp3b = await bufferToMp3(b, `comb_kokoro_${i}`);
            const fname = path.join(AUDIO_DIR, `combined_${uniqueId}_chunk_kokoro_${i}.mp3`);
            await writeBufferToFile(mp3b, fname);
            tempMp3Files.push(fname);
            createdFiles.push(fname);
          } else if (mime === "audio/wav" && !HAS_FFMPEG) {
            const gb = await gttsBuffer(chunks[i], "en");
            const fname2 = path.join(AUDIO_DIR, `combined_${uniqueId}_chunk_gtts_${i}.mp3`);
            await writeBufferToFile(gb, fname2);
            tempMp3Files.push(fname2);
            createdFiles.push(fname2);
          } else {
            const fname = path.join(AUDIO_DIR, `combined_${uniqueId}_chunk_kokoro_${i}.mp3`);
            await writeBufferToFile(b, fname);
            tempMp3Files.push(fname);
            createdFiles.push(fname);
          }
        } catch (kErr) {
          console.warn("KokoroPy failed for combined chunk", i, "falling back to gTTS:", kErr.message ?? kErr);
          const b2 = await gttsBuffer(chunks[i], "en");
          const fname2 = path.join(AUDIO_DIR, `combined_${uniqueId}_chunk_gtts_${i}.mp3`);
          await writeBufferToFile(b2, fname2);
          tempMp3Files.push(fname2);
          createdFiles.push(fname2);
        }
      }
    }

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
        m.ttsProvider_combined = ELEVEN_LABS_API_KEY ? "elevenlabs" : "kokoro_py/gtts";
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
        m.ttsProvider_combined = ELEVEN_LABS_API_KEY ? "elevenlabs" : "kokoro_py/gtts";
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

app.post("/api/medical/chat", async (req, res) => {
  try {
    const { prompt, image_base64 } = req.body || {};
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });
    const data = await callMedicalApi(prompt, image_base64 || null);
    return res.json(data);
  } catch (err) {
    console.error("Medical API proxy error:", err?.message ?? err);
    return res.status(500).json({ error: "Medical API proxy failed", details: err?.message ?? err });
  }
});

/* ---------------- main /chat ----------------
   If client sends { combine_audio: true } in body we will run produceCombinedAudioForMessages
   otherwise we only produce per-message audio (faster).
*/
app.post("/chat", async (req, res) => {
  try {
    const userMessage = (req.body?.message || "").toString().trim();
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

    const forceMedical = !!req.body?.medical;
    const imageBase64 = req.body?.image_base64 || null;
    if (forceMedical) {
      try {
        const medResp = await callMedicalApi(userMessage, imageBase64);
        let answerText = null;
        if (medResp && typeof medResp === "object" && "answer" in medResp) answerText = medResp.answer;
        else if (typeof medResp === "string") answerText = medResp;
        else answerText = JSON.stringify(medResp).slice(0, 2000);

        // Use chunk size ~350 (works well with Kokoro & gTTS)
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
You are a friendly virtual girlfriend assistant.
Reply with complete, concise sentences. Avoid run-on sentences longer than 100 words. Use short bullets if listing (<100 chars each).
You will reply with a JSON array (max 3 items).
Each item must contain: text (string, keep under 300 chars), facialExpression (string), animation (string).
facialExpression: one of [smile, sad, angry, surprised, funnyFace, default]
animation: one of [Talking_0, Talking_1, Talking_2, Crying, Laughing, Rumba, Idle, Terrified, Angry]
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
  console.log(`Virtual Girlfriend listening on port ${PORT}`);
});                                              update full codee for above use gtts but keep kokoro fallback and reduced time  and give full updated code -->