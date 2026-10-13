# create_memory_for_llm.py
import os
import re
import hashlib
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()

# flexible imports across LangChain versions
try:
    from langchain_community.document_loaders import PyPDFLoader, DirectoryLoader
except Exception as e:
    raise ImportError("Please install langchain-community (pip install langchain-community).") from e

# text splitter package name may vary by install
try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except Exception:
    from langchain.text_splitter import RecursiveCharacterTextSplitter

# embedding + FAISS
try:
    from langchain_huggingface import HuggingFaceEmbeddings
    from langchain_community.vectorstores import FAISS
except Exception:
    raise ImportError("Please install langchain_huggingface and langchain_community (pip install langchain-huggingface langchain-community).")

# Document location may vary by version
try:
    from langchain_core.documents import Document
except Exception:
    try:
        from langchain.schema import Document
    except Exception:
        from langchain.docstore.document import Document

# ================= CONFIG =================
DATA_PATH = "data"                       # data/{infant_care,nutrition,medicine,mental_health}
DB_FAISS_PATH = "vectorstore/db_faiss"
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

CHUNK_SIZE = 700
CHUNK_OVERLAP = 150

# ================= TEXT CLEANING =================
def clean_text(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"\r\n", "\n", text)
    text = re.sub(r"\n\s*\d+\s*\n", "\n", text)                      # strip page-alone numbers
    text = re.sub(r"page\s*\d+(\s*of\s*\d+)?", "", text, flags=re.I)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[^\S\r\n]{3,}", " ", text)
    return text.strip()

def text_hash(text: str) -> str:
    return hashlib.md5(text.encode("utf-8")).hexdigest()

# ================= LOAD PDFs =================
def load_all_pdfs(data_path: str):
    print(f"➡️ Loading PDFs from '{data_path}' (recursive)")
    loader = DirectoryLoader(
        data_path,
        glob="**/*.pdf",
        loader_cls=PyPDFLoader
    )
    raw_pages = loader.load()
    print(f"  🔎 Raw pages found: {len(raw_pages)}")
    docs = []

    # compute root folder name to detect files directly under data_path
    root_name = Path(data_path).name

    for page in raw_pages:
        src = page.metadata.get("source", "")
        cleaned = clean_text(page.page_content)
        if len(cleaned) < 50:
            continue
        path = Path(src)
        parent_name = path.parent.name if path.parent and path.parent.name else ""
        # set category: use parent folder name unless it equals the data root folder name
        if parent_name and parent_name != root_name:
            category = parent_name
        else:
            category = "general_medicine"
        meta = {
            "source": path.name,
            "source_path": str(path),
            "category": category,
            "page": page.metadata.get("page"),
        }
        docs.append(Document(page_content=cleaned, metadata=meta))
    print(f"  ✅ Pages kept after cleaning: {len(docs)}")
    return docs

# ================= CHUNKING =================
def create_chunks(documents):
    print("➡️ Splitting pages into chunks...")
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", " ", ""],
    )
    chunks = splitter.split_documents(documents)
    for c in chunks:
        c.metadata["chunk_hash"] = text_hash(c.page_content)
    print(f"  🧩 Chunks created: {len(chunks)}")
    return chunks

# ================= EMBEDDINGS =================
def get_embedding_model():
    print(f"➡️ Loading embedding model: {EMBEDDING_MODEL}")
    return HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)

# ================= BUILD / UPDATE FAISS =================
def build_vectorstore(chunks, embeddings, save_path=DB_FAISS_PATH, overwrite=False):
    os.makedirs(save_path, exist_ok=True)
    # load existing safe (allow deserialization for local DB)
    if not overwrite and os.path.exists(save_path) and any(Path(save_path).iterdir()):
        print("➡️ Existing FAISS found — loading safely")
        db = FAISS.load_local(save_path, embeddings, allow_dangerous_deserialization=True)
        existing_hashes = set()
        # docstore layout may vary; try common locations
        try:
            for doc in db.docstore._dict.values():
                h = doc.metadata.get("chunk_hash")
                if h:
                    existing_hashes.add(h)
        except Exception:
            # fallback: iterate similarity_search results (slow) — but prefer above
            pass
        new_docs = [c for c in chunks if c.metadata.get("chunk_hash") not in existing_hashes]
        print(f"➕ New unique chunks to add: {len(new_docs)}")
        if new_docs:
            db.add_documents(new_docs)
            db.save_local(save_path)
            print("💾 FAISS updated")
        else:
            print("ℹ️ No new content detected")
    else:
        print("➡️ Creating new FAISS vectorstore")
        db = FAISS.from_documents(chunks, embeddings)
        db.save_local(save_path)
        print(f"💾 FAISS saved to {save_path}")
    return db

# ================= RETRIEVAL DEMO =================
def demo_retrieval(db, query: str, k: int = 4):
    print("\n🔍 QUERY:", query)
    docs = db.similarity_search(query, k=k)
    if not docs:
        print("⚠️ No matches found")
        return
    print(f"\n📚 Top {len(docs)} Retrieved Chunks\n")
    for i, d in enumerate(docs, 1):
        m = d.metadata
        print(f"--- Result {i} ---")
        print(f"Category : {m.get('category')}")
        print(f"Source   : {m.get('source')}")
        print(f"Page     : {m.get('page')}")
        print(f"Preview  : {d.page_content[:350]}...")
        print()

# ================= MAIN =================
if __name__ == "__main__":
    pages = load_all_pdfs(DATA_PATH)
    chunks = create_chunks(pages)
    embeddings = get_embedding_model()
    db = build_vectorstore(chunks, embeddings, overwrite=False)

    demo_retrieval(
        db,
        query="What are danger signs of dehydration in newborns?",
        k=5
    )

    print("✅ Vectorstore ready for medibot / FastAPI usage")
