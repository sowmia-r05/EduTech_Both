"""
ai/gemini_explanation.py

Two modes (controlled by payload["mode"]):

  1. "explain"  → Given wrong answers + question context, generate
                  age-appropriate explanations for each wrong question.
                  Returns { success, explanations: [ { question_id, explanation,
                  correct_answer, tip, emoji } ] }

  2. "chat"     → Child sends a follow-up message about one question.
                  Returns { success, reply }

Year-level tone rules:
  Year 3-5  → fun, simple words, emojis, encouraging ("Great try! 🌟")
  Year 7-9  → logical, academic, strategy-focused, no baby talk
"""

import os
import sys
import json
import re

import google.generativeai as genai


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def get_tone_rules(year_level: int) -> dict:
    if year_level <= 5:
        return {
            "style": "fun, warm, encouraging",
            "language": "very simple words, short sentences, like talking to a young child",
            "emojis": "yes — use 1-2 relevant emojis per explanation",
            "tone": "Start with a kind encouragement like 'Great try! 🌟' or 'Nice attempt! 💪'",
            "depth": "Keep it simple: say what the right answer is and ONE easy reason why",
            "tip_style": "A fun memory trick or simple rule they can remember",
        }
    else:
        return {
            "style": "clear, academic, strategic",
            "language": "precise English, appropriate for a high school student",
            "emojis": "no emojis — keep it professional",
            "tone": "Direct and constructive — skip the filler praise",
            "depth": "Explain the reasoning/logic behind the correct answer, mention the strategy to use next time",
            "tip_style": "An exam strategy or rule they can apply systematically",
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


def init_model(api_key: str, model_name: str):
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(
        model_name,
        generation_config={"temperature": 0.4, "max_output_tokens": 2000},
    )


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
For each question below where the child got the wrong answer, write:
1. "explanation": Why their answer was wrong + what the correct answer is and why
2. "tip": A memorable trick or strategy for next time
3. "emoji": One relevant emoji (or "" if Year 7-9)

QUESTIONS TO EXPLAIN:
{questions_block}

OUTPUT: Return ONLY valid JSON — no markdown, no extra text.

{{
  "explanations": [
    {{
      "question_id": "...",
      "explanation": "...",
      "tip": "...",
      "emoji": "..."
    }}
  ]
}}

RULES:
- Keep each explanation under 60 words
- Keep each tip under 30 words
- Use the child's name ({child_name}) at least once across all explanations
- Never say "you got this wrong" — reframe positively
- Return ONLY explanations for the questions listed above
"""


def run_explain(payload: dict, model) -> dict:
    questions = payload.get("questions") or []
    year_level = int(payload.get("year_level") or 3)
    subject = payload.get("subject") or "General"
    child_name = payload.get("child_name") or "Student"

    if not questions:
        return {"success": True, "explanations": []}

    prompt = build_explain_prompt(questions, year_level, subject, child_name)

    try:
        resp = model.generate_content(prompt)
        text = getattr(resp, "text", "") or ""
        if not text:
            raise ValueError("Empty response from Gemini")
        result = extract_json(text)
        explanations = result.get("explanations") or []
        return {"success": True, "explanations": explanations}
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


def run_chat(payload: dict, model) -> dict:
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
        resp = model.generate_content(prompt)
        text = (getattr(resp, "text", "") or "").strip()
        if not text:
            raise ValueError("Empty response from Gemini")
        return {"success": True, "reply": text}
    except Exception as e:
        return {"success": False, "error": f"Chat failed: {str(e)}"}


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

    api_key = (os.getenv("GEMINI_API_KEY") or "").strip()
    model_name = (os.getenv("GEMINI_MODEL") or "gemini-2.0-flash").strip()

    if not api_key:
        print(json.dumps({"success": False, "error": "GEMINI_API_KEY not set"}))
        return

    try:
        model = init_model(api_key, model_name)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Gemini init failed: {str(e)}"}))
        return

    mode = payload.get("mode") or "explain"

    if mode == "explain":
        result = run_explain(payload, model)
    elif mode == "chat":
        result = run_chat(payload, model)
    else:
        result = {"success": False, "error": f"Unknown mode: {mode}"}

    print(json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    main()