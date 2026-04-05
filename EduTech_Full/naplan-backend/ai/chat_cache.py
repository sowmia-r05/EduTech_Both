"""
chat_cache.py
=============
Semantic cache for NAPLAN quiz chat messages using Qdrant + Gemini embeddings.

Two modes:
  check_cache  → embed user message, search Qdrant for similar Q&A scoped to quiz_id
  store_cache  → embed + persist a new Q&A pair in Qdrant

Input  (stdin)  : JSON payload
Output (stdout) : JSON result

check_cache payload:
  { "mode": "check_cache", "quiz_id": "abc123", "message": "what is perimeter", "threshold": 0.92 }
check_cache response:
  { "hit": true,  "answer": "...", "score": 0.97, "cached_question": "what does perimeter mean" }
  { "hit": false }

store_cache payload:
  { "mode": "store_cache", "quiz_id": "abc123", "message": "what is perimeter", "answer": "Perimeter is..." }
store_cache response:
  { "stored": true }
"""

import hashlib
import json
import os
import re
import sys
import time

from google import genai
from google.genai import types
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)

# ── Constants ─────────────────────────────────────────────────────────────────
COLLECTION       = "chat_cache"
EMBEDDING_MODEL  = "models/gemini-embedding-001"
EMBEDDING_DIM    = 3072          # gemini-embedding-001 dimension
DEFAULT_THRESHOLD = 0.92         # cosine similarity threshold for a cache hit
QDRANT_TIMEOUT   = 30            # seconds


# ── Helpers ───────────────────────────────────────────────────────────────────

def _normalize(text: str) -> str:
    """Lowercase, strip punctuation and extra spaces for stable embeddings."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text


def _point_id(quiz_id: str, message: str) -> int:
    """Deterministic int ID from quiz_id + raw message (md5 → 63-bit int)."""
    raw = f"{quiz_id}:{message}".encode()
    return int(hashlib.md5(raw).hexdigest()[:16], 16) % (2 ** 63)


# ── Client initialisation ─────────────────────────────────────────────────────

def _build_clients():
    api_key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not api_key:
        raise ValueError("GEMINI_API_KEY env var not set")

    qdrant_url     = os.getenv("QDRANT_URL") or "http://localhost:6333"
    qdrant_api_key = os.getenv("QDRANT_API_KEY") or None

    gemini = genai.Client(api_key=api_key)

    qdrant_kwargs: dict = {"url": qdrant_url, "timeout": QDRANT_TIMEOUT}
    if qdrant_api_key:
        qdrant_kwargs["api_key"] = qdrant_api_key
    qdrant = QdrantClient(**qdrant_kwargs)

    return gemini, qdrant


def _ensure_collection(qdrant: QdrantClient) -> None:
    """Create the chat_cache collection if it does not exist yet."""
    existing = {c.name for c in qdrant.get_collections().collections}
    if COLLECTION not in existing:
        qdrant.create_collection(
            collection_name=COLLECTION,
            vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
        )


# ── Embedding ─────────────────────────────────────────────────────────────────

# AFTER
def _embed(gemini, text: str, task_type: str = "retrieval_query") -> list[float]:
    """Embed normalised text using gemini-embedding-001."""
    result = gemini.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=_normalize(text),
        config=types.EmbedContentConfig(task_type=task_type),
    )
    return result.embeddings[0].values

# ── Cache operations ──────────────────────────────────────────────────────────

def check_cache(
    gemini,
    qdrant: QdrantClient,
    quiz_id: str,
    message: str,
    threshold: float,
) -> dict:
    """
    Search Qdrant for a semantically similar question in this quiz's cache.

    Returns:
        { "hit": True,  "answer": "...", "score": 0.97, "cached_question": "..." }
        { "hit": False }
    """
    embedding = _embed(gemini, message, task_type="retrieval_query") # 

    # Filter to this quiz only — different quizzes can have the same question text
    # but need different scoped answers.
    quiz_filter = Filter(
        must=[FieldCondition(key="quiz_id", match=MatchValue(value=quiz_id))]
    )

    try:
        if hasattr(qdrant, "query_points"):
            # qdrant-client >= 1.7
            result = qdrant.query_points(
                collection_name=COLLECTION,
                query=embedding,
                limit=1,
                score_threshold=threshold,
                query_filter=quiz_filter,
            )
            points = result.points if hasattr(result, "points") else result
        else:
            # qdrant-client < 1.7 fallback
            points = qdrant.search(
                collection_name=COLLECTION,
                query_vector=embedding,
                limit=1,
                score_threshold=threshold,
                query_filter=quiz_filter,
            )
    except Exception as exc:
        # Treat any Qdrant error as a cache miss — never block a user request
        return {"hit": False, "_qdrant_error": str(exc)}

    if not points:
        return {"hit": False}

    top = points[0]
    return {
        "hit": True,
        "answer": top.payload.get("answer", ""),
        "score": round(float(top.score), 4),
        "cached_question": top.payload.get("original_message", ""),
    }


def store_cache(
    gemini,
    qdrant: QdrantClient,
    quiz_id: str,
    message: str,
    answer: str,
) -> dict:
    """
    Embed and persist a Q&A pair in the chat_cache collection.

    Uses a deterministic point ID so re-asking the exact same question
    overwrites the existing entry rather than creating a duplicate.
    """
    embedding = _embed(gemini, message, task_type="retrieval_document")

    qdrant.upsert(
        collection_name=COLLECTION,
        points=[
            PointStruct(
                id=_point_id(quiz_id, message),
                vector=embedding,
                payload={
                    "quiz_id":          quiz_id,
                    "original_message": message,
                    "answer":           answer,
                    "stored_at":        int(time.time()),
                },
            )
        ],
    )
    return {"stored": True}


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw or "{}")
    except json.JSONDecodeError as exc:
        print(json.dumps({"error": f"Invalid JSON input: {exc}"}))
        return

    mode     = payload.get("mode", "")
    quiz_id  = (payload.get("quiz_id") or "").strip()
    message  = (payload.get("message") or "").strip()
    threshold = float(payload.get("threshold", DEFAULT_THRESHOLD))

    if not quiz_id or not message:
        print(json.dumps({"error": "quiz_id and message are required"}))
        return

    try:
        gemini, qdrant = _build_clients()
        _ensure_collection(qdrant)
    except Exception as exc:
        print(json.dumps({"error": f"Client init failed: {exc}"}))
        return

    if mode == "check_cache":
        result = check_cache(gemini, qdrant, quiz_id, message, threshold)

    elif mode == "store_cache":
        answer = (payload.get("answer") or "").strip()
        if not answer:
            print(json.dumps({"error": "answer is required for store_cache"}))
            return
        result = store_cache(gemini, qdrant, quiz_id, message, answer)

    else:
        result = {"error": f"Unknown mode: '{mode}'. Use check_cache or store_cache."}

    print(json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    main()