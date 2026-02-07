import os
import google.generativeai as genai

# ----------------------------
# Gemini configuration
# ----------------------------
genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))
MODEL_NAME = "gemini-2.5-flash"

# ----------------------------
# Performance tuning
# ----------------------------
MIN_AI_WORDS = 20
RELEVANCE_PREVIEW_LINES = 20   # take first 10–20 lines (we use 20)
RELEVANCE_PREVIEW_WORDS = 180  # additional cap for preview
