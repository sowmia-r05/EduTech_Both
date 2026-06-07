"""
ai/gemini_explanation.py

Modes (controlled by payload["mode"]):
  1. "explain"           → explanations for wrong answers (JSON)
  2. "explain_question"  → single-question explanation at upload time (JSON)
  3. "chat"              → child follow-up about one question (plain text)
  4. "agent_chat"        → subject-specific agent reply (plain text)

Provider selection:
- OpenAI primary, Gemini fallback on ANY error (billing 429, rate limit,
  timeout, empty/invalid response).
- Override order with AI_PRIMARY_PROVIDER = "openai" | "gemini".
- Needs OPENAI_API_KEY and/or GEMINI_API_KEY in the environment.
"""

import os
import sys
import json
import re
import importlib

# ── Add backend root to Python path ──────────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

try:
    import google.generativeai as genai
except ImportError:
    genai = None


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def get_tone_rules(year_level: int) -> dict:
    y = int(year_level or 3)
    if y <= 3:
        return {
            "style": "warm, very simple, friendly",
            "language": "very short sentences, simple words a Year 3 child (age 8) understands",
            "emojis": "no emojis",
            "tone": "Kind and simple — just explain the answer plainly",
            "depth": "Say what the right answer is and ONE very simple reason why",
            "tip_style": "A simple one-sentence rule they can remember easily",
        }
    elif y <= 5:
        return {
            "style": "friendly, clear, encouraging",
            "language": "simple English, short sentences, suitable for a Year 5 student (age 10-11)",
            "emojis": "no emojis",
            "tone": "Encouraging but not babyish — explain the answer clearly",
            "depth": "Explain the correct answer and the main reason why in 2-3 simple sentences",
            "tip_style": "A short memorable trick or rule for next time",
        }
    elif y <= 7:
        return {
            "style": "clear, logical, accessible",
            "language": "plain English suitable for a Year 7 student (age 12-13)",
            "emojis": "no emojis",
            "tone": "Direct and clear — no filler, explain the concept",
            "depth": "Explain why the correct answer is right and what concept or rule applies",
            "tip_style": "A concise study tip or rule they can apply next time",
        }
    else:
        return {
            "style": "academic, strategic, precise",
            "language": "formal English appropriate for a Year 9 student (age 14-15)",
            "emojis": "no emojis",
            "tone": "Direct and analytical — focus on reasoning and exam strategy",
            "depth": "Explain the logic behind the correct answer and name the concept or rule",
            "tip_style": "An exam strategy or systematic rule they can apply under pressure",
        }


def extract_json(text: str):
    text = text.strip()
    # Strip markdown code fences
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)
    text = text.strip()
    try:
        return json.loads(text)
    except Exception:
        # Try to extract last valid JSON block
        start = text.rfind("{")
        end = text.rfind("}") + 1
        if start != -1 and end > start:
            try:
                return json.loads(text[start:end])
            except Exception:
                pass
        raise ValueError(f"No valid JSON found in output: {text[:300]}")


# ═══════════════════════════════════════════════════════════════
# PROVIDERS: OpenAI primary + Gemini fallback
# ═══════════════════════════════════════════════════════════════
def _make_openai():
    if OpenAI is None:
        return None
    key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not key:
        return None
    model = (os.getenv("OPENAI_MODEL") or "gpt-4o-mini").strip()
    return {"provider": "openai", "client": OpenAI(api_key=key), "model": model}


def _make_gemini():
    if genai is None:
        return None
    key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not key:
        return None
    model = (os.getenv("GEMINI_MODEL") or "gemini-2.0-flash").strip()
    genai.configure(api_key=key)
    return {"provider": "gemini", "client": genai.GenerativeModel(model), "model": model}


def init_providers():
    """Return available providers, primary first. Empty list if no keys set."""
    primary = (os.getenv("AI_PRIMARY_PROVIDER") or "openai").strip().lower()
    openai_p = _make_openai()
    gemini_p = _make_gemini()
    order = [gemini_p, openai_p] if primary == "gemini" else [openai_p, gemini_p]
    return [p for p in order if p]


def _call_openai(p, prompt, temperature, max_tokens, json_mode):
    kwargs = dict(
        model=p["model"],
        messages=[{"role": "user", "content": prompt}],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    resp = p["client"].chat.completions.create(**kwargs)
    return resp.choices[0].message.content or ""


def _call_gemini(p, prompt, temperature, max_tokens, json_mode):
    cfg = {"temperature": temperature, "max_output_tokens": max_tokens}
    if json_mode:
        cfg["response_mime_type"] = "application/json"
    try:
        resp = p["client"].generate_content(prompt, generation_config=cfg)
    except TypeError:
        # older SDKs may reject response_mime_type
        cfg.pop("response_mime_type", None)
        resp = p["client"].generate_content(prompt, generation_config=cfg)
    return getattr(resp, "text", "") or ""


def generate_text(providers, prompt, temperature=0.4, max_tokens=2000, json_mode=False, max_retries=2):
    """
    Try each provider in order, retry max_retries each, fall back on failure.
    Returns (text, model_used, provider_used).
    """
    last_error = None
    for p in providers:
        for _ in range(max_retries):
            try:
                if p["provider"] == "openai":
                    text = _call_openai(p, prompt, temperature, max_tokens, json_mode)
                else:
                    text = _call_gemini(p, prompt, temperature, max_tokens, json_mode)
                if not text or not text.strip():
                    raise ValueError("Empty response from model")
                return text, p["model"], p["provider"]
            except Exception as e:
                last_error = e
    raise ValueError(f"All providers failed. Last error: {str(last_error)}")


# ─────────────────────────────────────────────────────────────
# Mode 1: Generate explanations for wrong answers
# ─────────────────────────────────────────────────────────────

def build_explain_prompt(questions: list, year_level: int, subject: str, child_name: str) -> str:
    tone = get_tone_rules(year_level)

    questions_block = ""
    for i, q in enumerate(questions, 1):
        questions_block += f"""
Question {i} (ID: {q.get('question_id', '')})
  Text: {q.get('question_text', '(no text)')}
  Child answered: {q.get('child_answer', '(no answer)')}
  Correct answer: {q.get('correct_answer', '(unknown)')}
  Topic/Category: {q.get('category', 'General')}
"""

    return f"""You are an AI tutor for Australian NAPLAN students.

STUDENT: {child_name}, Year {year_level}, Subject: {subject}

TONE RULES:
- Style: {tone['style']}
- Language: {tone['language']}
- Emojis: {tone['emojis']}
- Opening tone: {tone['tone']}
- Explanation depth: {tone['depth']}
- Tip style: {tone['tip_style']}

TASK:
For each question below, write a generic explanation that works for ANY student who got it wrong:
1. "explanation": What the correct answer is and clearly why it is correct
2. "tip": A short memorable trick or strategy for next time
Do NOT mention any specific wrong answer the student picked — keep it generic.
No emojis.

QUESTIONS TO EXPLAIN:
{questions_block}

OUTPUT: Return ONLY valid JSON — no markdown, no extra text.

{{
  "explanations": [
    {{
      "question_id": "...",
      "explanation": "...",
      "tip": "..."
    }}
  ]
}}

RULES:
- Keep each explanation under 60 words
- Keep each tip under 30 words
- Never say "you got this wrong" — reframe positively
- Return ONLY explanations for the questions listed above
"""


# ─────────────────────────────────────────────────────────────
# Mode 3: Pre-generate explanation for a single question
# ─────────────────────────────────────────────────────────────

def build_single_question_prompt(question: dict, year_level: int) -> str:
    tone = get_tone_rules(year_level)
    return f"""You are an AI tutor for Australian NAPLAN students (Year {year_level}).

TONE RULES:
- Style: {tone['style']}
- Language: {tone['language']}
- Emojis: {tone['emojis']}
- Tone: {tone['tone']}
- Depth: {tone['depth']}
- Tip style: {tone['tip_style']}

QUESTION: {question.get('question_text', '')}
CORRECT ANSWER: {question.get('correct_answer', '')}
TOPIC: {question.get('category', 'General')}

Write a generic explanation for any student who got this question wrong.
Do NOT mention any specific wrong answer — keep it generic.
No emojis.

Return ONLY valid JSON, no markdown:
{{
  "explanation": "...",
  "tip": "..."
}}

RULES:
- explanation under 60 words
- tip under 25 words
- Year {year_level} appropriate language
- No emojis at all
"""


def run_explain_question(payload: dict, providers) -> dict:
    """
    Generates explanation for a single question using the quiz's year level only.
    Called at quiz upload time, NOT per-student.
    """
    question = payload.get("question") or {}
    year_level = payload.get("year_level")

    if not question.get("question_text"):
        return {"success": False, "error": "No question_text provided"}

    if not year_level:
        return {"success": False, "error": "No year_level provided — skipping"}

    yr = int(year_level)
    prompt = build_single_question_prompt(question, yr)

    try:
        text, _model, provider = generate_text(
            providers, prompt, temperature=0.4, max_tokens=2000, json_mode=True
        )
        result = extract_json(text)
        return {
            "success": True,
            "provider": provider,
            "explanations_by_year": {
                str(yr): {
                    "explanation": result.get("explanation", ""),
                    "tip":         result.get("tip", ""),
                }
            }
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def run_explain(payload: dict, providers) -> dict:
    questions = payload.get("questions") or []
    year_level = int(payload.get("year_level") or 3)
    subject = payload.get("subject") or "General"
    child_name = payload.get("child_name") or "Student"

    if not questions:
        return {"success": True, "explanations": []}

    prompt = build_explain_prompt(questions, year_level, subject, child_name)

    try:
        text, _model, provider = generate_text(
            providers, prompt, temperature=0.4, max_tokens=2000, json_mode=True
        )
        result = extract_json(text)
        explanations = result.get("explanations") or []
        return {"success": True, "provider": provider, "explanations": explanations}
    except Exception as e:
        return {"success": False, "error": f"Explanation generation failed: {str(e)}"}


# ─────────────────────────────────────────────────────────────
# Mode 2: Chat — child asks a follow-up question
# ─────────────────────────────────────────────────────────────

def build_chat_prompt(
    question_context: dict,
    chat_history: list,
    child_message: str,
    year_level: int,
    child_name: str,
) -> str:
    tone = get_tone_rules(year_level)

    history_block = ""
    for turn in (chat_history or []):
        role = "Child" if turn.get("role") == "child" else "AI Tutor"
        history_block += f"{role}: {turn.get('content', '')}\n"

    q = question_context or {}

    return f"""You are a friendly AI tutor for {child_name}, a Year {year_level} Australian NAPLAN student.

QUESTION CONTEXT:
  Question text: {q.get('question_text', '(not provided)')}
  Correct answer: {q.get('correct_answer', '(not provided)')}
  Child's answer: {q.get('child_answer', '(not provided)')}
  Topic: {q.get('category', 'General')}

TONE RULES:
- Style: {tone['style']}
- Language: {tone['language']}
- Emojis: {tone['emojis']}
- Depth: {tone['depth']}

CONVERSATION SO FAR:
{history_block if history_block else "(This is the first message)"}

Child's new message: {child_message}

INSTRUCTIONS:
- Answer ONLY what the child asked
- Stay focused on this specific question
- Keep your reply under 80 words
- Do NOT repeat the full explanation if you already gave it
- If the child is confused, try a different angle or analogy
- If the child says thanks or is done, give a short warm sign-off
- Return ONLY plain text — no JSON, no markdown headers

Your reply:"""


def run_chat(payload: dict, providers) -> dict:
    question_context = payload.get("question_context") or {}
    chat_history = payload.get("chat_history") or []
    child_message = payload.get("message") or ""
    year_level = int(payload.get("year_level") or 3)
    child_name = payload.get("child_name") or "Student"

    if not child_message.strip():
        return {"success": False, "error": "No message provided"}

    prompt = build_chat_prompt(
        question_context, chat_history, child_message, year_level, child_name
    )

    try:
        text, _model, provider = generate_text(
            providers, prompt, temperature=0.4, max_tokens=1024, json_mode=False
        )
        return {"success": True, "provider": provider, "reply": text.strip()}
    except Exception as e:
        return {"success": False, "error": f"Chat failed: {str(e)}"}


# ─────────────────────────────────────────────────────────────
# Mode 4: Agent chat — routes to subject-specific agent
# ─────────────────────────────────────────────────────────────

def run_agent_chat(payload: dict, providers) -> dict:
    subject       = (payload.get("subject") or "").strip().lower()
    message       = (payload.get("message") or "").strip()
    chat_history  = payload.get("chat_history") or []
    attempt_ctx   = payload.get("attempt_context") or {}
    history_block = payload.get("history_context") or ""

    if not message:
        return {"success": False, "error": "No message provided"}

    subject_map = {
        "maths":                "ai.prompts.maths_agent",
        "numeracy":             "ai.prompts.maths_agent",
        "reading":              "ai.prompts.reading_agent",
        "language conventions": "ai.prompts.language_agent",
        "language":             "ai.prompts.language_agent",
        "writing":              "ai.prompts.writing_agent",
    }
    module_path = subject_map.get(subject, "ai.prompts.generic_agent")

    try:
        agent_module = importlib.import_module(module_path)
        prompt = agent_module.build_prompt(
            attempt_ctx, history_block, chat_history, message
        )
    except Exception as e:
        return {"success": False, "error": f"Prompt build failed: {str(e)}"}

    try:
        text, _model, provider = generate_text(
            providers, prompt, temperature=0.4, max_tokens=1024, json_mode=False
        )
        return {"success": True, "provider": provider, "reply": text.strip()}
    except Exception as e:
        return {"success": False, "error": f"Agent chat failed: {str(e)}"}


# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────

def main():
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw or "{}")
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON input: {str(e)}"}))
        return

    providers = init_providers()
    if not providers:
        print(json.dumps({
            "success": False,
            "error": "No AI provider available. Set OPENAI_API_KEY and/or GEMINI_API_KEY "
                     "(and install: pip install openai google-generativeai)."
        }))
        return

    mode = payload.get("mode") or "explain"

    if mode == "explain":
        result = run_explain(payload, providers)
    elif mode == "explain_question":
        result = run_explain_question(payload, providers)
    elif mode == "chat":
        result = run_chat(payload, providers)
    elif mode == "agent_chat":
        result = run_agent_chat(payload, providers)
    else:
        result = {"success": False, "error": f"Unknown mode: {mode}"}

    print(json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    main()