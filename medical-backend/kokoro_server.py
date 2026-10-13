# kokoro_server.py — FAST, SAFE, NON-BLOCKING KOKORO SERVER
# Compatible with your Node.js backend

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from kokoro import KPipeline
import soundfile as sf
import io
import base64
import numpy as np
import torch
import threading
import time

# ---------------- App ----------------
app = FastAPI(title="Kokoro TTS Server", version="1.0")

# ---------------- Torch optimizations ----------------
torch.set_num_threads(1)          # VERY IMPORTANT on CPU
torch.set_num_interop_threads(1)
torch.backends.cudnn.enabled = False

# ---------------- Load model ONCE ----------------
print("🚀 Loading Kokoro PyTorch model...")
pipeline = KPipeline(lang_code="a")
print("✅ Kokoro ready.")

# ---------------- Request schema ----------------
class TTSRequest(BaseModel):
    text: str
    voice: str = "af_heart"
    speed: float = 1.0

# ---------------- Constants ----------------
MAX_TEXT_LEN = 220          # hard safety limit
SAMPLE_RATE = 24000
INFERENCE_TIMEOUT = 15.0    # seconds

# ---------------- Health ----------------
@app.get("/")
def health():
    return {"status": "kokoro running", "engine": "pytorch"}

# ---------------- Internal inference with timeout ----------------
def run_tts(text: str, voice: str, speed: float, out: dict):
    try:
        # Direct inference (NO generator loop)
        result = pipeline(
            text,
            voice=voice,
            speed=speed,
            split_pattern=None   # ❗ DO NOT split internally
        )

        # result is a list of segments → concat safely
        audio_list = []
        for _, _, audio in result:
            audio_list.append(audio)

        if not audio_list:
            out["error"] = "no audio generated"
            return

        audio = np.concatenate(audio_list)

        buf = io.BytesIO()
        sf.write(buf, audio, SAMPLE_RATE, format="WAV")

        out["audio"] = buf.getvalue()

    except Exception as e:
        out["error"] = str(e)

# ---------------- TTS endpoint ----------------
@app.post("/tts")
def tts(req: TTSRequest):
    text = (req.text or "").strip()

    if not text:
        raise HTTPException(status_code=400, detail="Empty text")

    # HARD length guard (Node already chunks, this is safety)
    if len(text) > MAX_TEXT_LEN:
        raise HTTPException(
            status_code=413,
            detail=f"Text too long for Kokoro ({len(text)} > {MAX_TEXT_LEN}). Use chunking."
        )

    output = {}
    thread = threading.Thread(
        target=run_tts,
        args=(text, req.voice, req.speed, output),
        daemon=True
    )

    start = time.time()
    thread.start()
    thread.join(INFERENCE_TIMEOUT)

    if thread.is_alive():
        raise HTTPException(
            status_code=504,
            detail="Kokoro inference timeout"
        )

    if "error" in output:
        raise HTTPException(
            status_code=500,
            detail=output["error"]
        )

    wav_bytes = output.get("audio")
    if not wav_bytes:
        raise HTTPException(
            status_code=500,
            detail="No audio output"
        )

    return {
        "audio_base64": base64.b64encode(wav_bytes).decode("utf-8"),
        "sample_rate": SAMPLE_RATE
    }

#venv\Scripts\activate
#
# python -m uvicorn kokoro_server:app 
# --host 127.0.0.1
# --port 5002