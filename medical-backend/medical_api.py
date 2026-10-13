"""
Medical Bot FastAPI Backend — FINAL MULTIMODAL VERSION (CHAT FIXED)

✔ Chatbox display fixed
✔ Clean speech output
✔ No symbols / markdown issues
✔ Better chunking
✔ Production-ready
"""

import os
import io
import re
import base64
import traceback
from typing import Optional, List, Dict, Set
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image, UnidentifiedImageError
import uvicorn

from medibot import ask_medibot

# ---------------- CONFIG ----------------
DATA_PATH = os.getenv("DATA_PATH", "data")
DB_FAISS_PATH = os.getenv("DB_FAISS_PATH", "vectorstore/db_faiss")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")

# ---------------- FAISS ----------------
try:
    from langchain_huggingface import HuggingFaceEmbeddings
    from langchain_community.vectorstores import FAISS
    FAISS_AVAILABLE = True
except:
    FAISS_AVAILABLE = False

app = FastAPI(title="Medical Bot API", version="3.1-chat-fixed")

# ---------------- CORS ----------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- MODELS ----------------
class ChatRequest(BaseModel):
    prompt: str
    image_base64: Optional[str] = None


# =====================================================
# CLEAN TEXT FOR SPEECH
# =====================================================
def clean_for_speech(text: str) -> str:
    if not text:
        return ""

    text = re.sub(r"[*#`]", "", text)
    text = re.sub(r"[-•]", "", text)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s([?.!,])", r"\1", text)

    return text.strip()


# =====================================================
# SPLIT INTO SPEAKABLE CHUNKS
# =====================================================
def split_into_chunks(text: str, max_len: int = 200) -> List[str]:

    sentences = re.split(r'(?<=[.!?]) +', text)

    chunks = []
    current = ""

    for sentence in sentences:

        if len(current) + len(sentence) <= max_len:
            current += sentence + " "

        else:
            chunks.append(current.strip())
            current = sentence + " "

    if current.strip():
        chunks.append(current.strip())

    return chunks


# ---------------- CATEGORY UTILS ----------------
def tokenize_for_keywords(s: str) -> Set[str]:
    return {t for t in re.split(r"[^a-zA-Z0-9]+", s.lower()) if len(t) > 3}


def build_category_keyword_map(data_path: str) -> Dict[str, Set[str]]:

    mapping = {}

    if not os.path.exists(data_path):
        return mapping

    for entry in os.scandir(data_path):

        if entry.is_dir():
            mapping[entry.name] = tokenize_for_keywords(entry.name)

    return mapping


def infer_category(prompt: str, ck: Dict[str, Set[str]]) -> Optional[str]:

    p = prompt.lower()

    best, score = None, 0

    for cat, kws in ck.items():

        s = sum(1 for k in kws if k in p)

        if s > score:
            best, score = cat, s

    return best


# ---------------- LIFESPAN ----------------
@asynccontextmanager
async def lifespan(app: FastAPI):

    print("\n Medical API starting...")

    app.state.faiss_db = None
    app.state.category_keywords = {}

    try:

        app.state.category_keywords = build_category_keyword_map(DATA_PATH)

        print(" Categories:",
              list(app.state.category_keywords.keys()))

    except:
        traceback.print_exc()

    if FAISS_AVAILABLE and os.path.exists(DB_FAISS_PATH):

        try:

            print(" Loading FAISS...")

            embeddings = HuggingFaceEmbeddings(
                model_name=EMBEDDING_MODEL
            )

            app.state.faiss_db = FAISS.load_local(
                DB_FAISS_PATH,
                embeddings,
                allow_dangerous_deserialization=True
            )

            print(" FAISS loaded")

        except:

            print(" FAISS load failed")

            traceback.print_exc()

    else:

        print(" FAISS not available")

    yield

    print(" Medical API shutting down")


app.router.lifespan_context = lifespan


# ---------------- CHAT ----------------
@app.post("/chat")
async def chat(
    request: Request,
    prompt: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
):

    print("\n==============================")
    print("[REQ] /chat called")

    json_data = None
    incoming_b64 = None
    prompt_text = prompt

    # -------- Parse request --------

    if "application/json" in (
        request.headers.get("content-type") or ""
    ):

        try:

            json_data = await request.json()

            prompt_text = (
                json_data.get("prompt")
                or json_data.get("message")
            )

            incoming_b64 = json_data.get(
                "image_base64"
            )

            print("[REQ] JSON received")

        except:

            print("[REQ] Invalid JSON")

    else:

        form = await request.form()

        prompt_text = (
            prompt_text
            or form.get("prompt")
            or form.get("message")
        )

        incoming_b64 = form.get(
            "image_base64"
        )

        print("[REQ] Form received")

    prompt_text = (prompt_text or "").strip()

    if not prompt_text:

        raise HTTPException(400, "Prompt missing")

    # -------- Image handling --------

    pil_img = None

    try:

        if image:

            img_bytes = await image.read()

            pil_img = Image.open(
                io.BytesIO(img_bytes)
            ).convert("RGB")

            print("[IMG] Upload image loaded")

        elif incoming_b64:

            img_bytes = base64.b64decode(
                incoming_b64
            )

            pil_img = Image.open(
                io.BytesIO(img_bytes)
            ).convert("RGB")

            print("[IMG] Base64 image loaded")

    except (UnidentifiedImageError, OSError):

        print("[IMG] Invalid image")

    except Exception:

        traceback.print_exc()

    # -------- Category --------

    cat = infer_category(
        prompt_text,
        app.state.category_keywords
    )

    print("[RAG] Category:", cat)

    # -------- LLM CALL --------

    try:

        print("[LLM] Calling Medibot...")

        answer = ask_medibot(
            prompt_text,
            pil_img
        )

        print(
            "[LLM] Response length:",
            len(answer or "")
        )

    except Exception:

        traceback.print_exc()

        answer = (
            "Medical service temporarily unavailable."
        )

    # CLEAN TEXT
    clean_text = clean_for_speech(answer)

    # SPLIT INTO CHUNKS
    chunks = split_into_chunks(clean_text)

    # 🔥 FIXED MESSAGE FORMAT
    formatted_messages = []

    for c in chunks:

        formatted_messages.append({

            "role": "assistant",
            "content": c,

            "facialExpression": "default",
            "animation": "Talking_0",

            "audio": None,
            "lipsync": None,

        })

    return {

        "messages": formatted_messages,

        "image_used": pil_img is not None,

        "category": cat,

    }


# ---------------- RUN ----------------
if __name__ == "__main__":

    uvicorn.run(
        "medical_api:app",
        host="127.0.0.1",
        port=8001,
        reload=False
    )

    #  .\venv\Scripts\Activate