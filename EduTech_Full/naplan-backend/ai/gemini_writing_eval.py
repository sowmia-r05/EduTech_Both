import os
import sys
import json
from typing import Optional

import google.generativeai as genai

from ai.gemini_config import MODEL_NAME, MIN_AI_WORDS
from ai.text_cleaning import cleaned_for_checks, is_blank, count_words, sanitize_text
from ai.naplan_scoring import (
    guess_text_type,
    build_schema_max,
    year_level_expectation,
    extract_json,
    normalize_criteria_list,
    band_from_score,
    ensure_review_sections_shape,
    generate_word_count_feedback,
)

# LangSmith tracing (safe)
try:
    from langsmith import traceable
except Exception:  # pragma: no cover
    def traceable(*args, **kwargs):
        def deco(fn):
            return fn
        return deco


def _base_output_shape(student_year: int, text_type: str, max_total: int = 0) -> dict:
    """
    Always return same keys to avoid KeyError downstream.
    Ensures meta.prompt_relevance always exists.
    """
    data = {
        "meta": {
            "year_level": student_year,
            "text_type": text_type,
            "valid_response": False,
            "prompt_relevance": {  # ✅ always present
                "score": 0,
                "verdict": "off_topic",
                "note": "",
                "evidence": ""
            },
        },
        "overall": {
            "total_score": 0,
            "max_score": max_total,
            "band": "Below Minimum Standard",
            "one_line_summary": "",
            "summary": "",
            "strengths": [],
            "weaknesses": [],
        },
        "review_sections": [],
        "criteria": [],
    }
    ensure_review_sections_shape(data)
    return data


@traceable(name="naplan.full_gemini_assessment")
def _call_full_model(
    student_year: int,
    text_type: str,
    writing_prompt: str,
    student_clean: str,
    max_total: int
) -> dict:
    """
    Full model call with:
    - capped tokens
    - JSON-only output (when supported)
    """
    api_key = os.environ.get("GEMINI_API_KEY", "")
    genai.configure(api_key=api_key)

    generation_config = {
        "temperature": 0.25,
    }

    # ✅ If SDK supports it, force JSON output
    # (Some versions may raise TypeError; handled below)
    try:
        generation_config["response_mime_type"] = "application/json"
    except Exception:
        pass

    try:
        model = genai.GenerativeModel(MODEL_NAME, generation_config=generation_config)
    except TypeError:
        # fallback for older SDKs that don't accept some generation_config keys
        safe_config = {
            "temperature": generation_config.get("temperature", 0.25) }
        model = genai.GenerativeModel(MODEL_NAME, generation_config=safe_config)

    prompt = f"""You are an Australian NAPLAN writing assessor.

YEAR: {student_year}
TEXT TYPE: {text_type}

Year expectations:
{year_level_expectation(student_year)}

PROMPT:
{writing_prompt}

STUDENT RESPONSE:
{student_clean}

STRICT CONTENT RULES:
- Do not invent story details (characters, events, settings, actions) not in PROMPT or STUDENT RESPONSE.
- If prompt is vague (e.g. "look at the picture"), do not guess the picture.

WRITING RULES:
- Use a neutral NAPLAN assessor voice at all times.
- Write in third person only; do not use first-person language.
- Do not refer to the writer as “the student” or use personal labels.
- Do not quote or repeat any part of the student’s writing in:
    * overall.one_line_summary.
    * overall.summary.
    
- Avoid conversational or instructional tone; write as an assessor.
- Use Australian English spelling and conventions throughout.

PROMPT RELEVANCE:
- score 0-100; verdict: on_topic | partially_on_topic | off_topic
- Include ONE evidence quote (8-25 words) from student writing.

EVIDENCE:
- Provide evidence_quote ONLY for Vocabulary, Punctuation, Spelling.
- Each evidence_quote must be 8-15 exact words from the student response.

CRITERIA:
- Return ALL applicable NAPLAN criteria for this text type.
- Narrative only: include Persuasive Devices with score=null, max=null, suggestion="N/A (narrative)", evidence_quote="".
- For each criterion: short suggestion (max 2 sentences, prefer <140 chars): what is missing + what to do next.

MAX SCORES:
Audience 6, Text Structure 6, Ideas 6, Persuasive Devices 5,
Vocabulary 6, Cohesion 5, Paragraphing 4,
Sentence Structure 6, Punctuation 5, Spelling 6.

OUTPUT:
Return ONLY valid JSON (ASCII only). No markdown, no extra text.

JSON FORMAT (exact keys):
{{
  "meta": {{
    "year_level": {student_year},
    "text_type": "{text_type}",
    "prompt_relevance": {{
      "score": 0,
      "verdict": "on_topic",
      "note": "short note",
      "evidence": "quote"
    }}
  }},
  "overall": {{
    "total_score": 0,
    "max_score": {max_total},
    "band": "Below Minimum Standard",
    "one_line_summary": "one neutral sentence",
    "summary": "1-2 neutral sentences (mention off-topic if applicable)",
    "strengths": ["...", "..."],
    "weaknesses": ["...", "..."]
  }},
  "review_sections": [
    {{
      "id": "sentence_improvements",
      "title": "Make these sentences stronger",
      "items": ["..."]
    }},
    {{
      "id": "ideas_development",
      "title": "Ideas development suggestions",
      "items": ["..."]
    }},
    {{
      "id": "next_steps",
      "title": "Next time try this",
      "items": ["..."]
    }},
    {{
      "id": "mini_rewrite",
      "title": "Mini rewrite (example)",
      "items": ["..."]
    }}
  ],
  "criteria": []
}}
"""

    response = model.generate_content(prompt)
    raw_text = getattr(response, "text", "") or ""
    return extract_json(raw_text)


@traceable(name="naplan.evaluate_naplan_writing")
def evaluate_naplan_writing(
    student_year: int,
    writing_prompt: str,
    student_writing: str,
    text_type: Optional[str] = None
):
    # Determine text type
    if text_type is None:
        text_type = guess_text_type(writing_prompt, student_writing)
    if text_type not in ("Narrative", "Persuasive"):
        text_type = "Narrative"

    student_clean = cleaned_for_checks(student_writing)
    prompt_clean = sanitize_text(writing_prompt, max_len=4000)

    # ✅ compute max_total early so even blank/too-short has correct max_score
    applicable_max = build_schema_max(text_type)
    max_total = sum(v for v in applicable_max.values() if isinstance(v, int))

    # Blank writing
    if is_blank(student_clean):
        data = _base_output_shape(student_year, text_type, max_total=max_total)
        data["meta"]["valid_response"] = False
        data["meta"]["prompt_relevance"] = {
            "score": 0,
            "verdict": "off_topic",
            "note": "No student writing provided.",
            "evidence": ""
        }
        data["overall"]["summary"] = "No writing was provided for assessment."
        ensure_review_sections_shape(data)
        return {"success": True, "result": data}

    # Missing API key
    if not os.environ.get("GEMINI_API_KEY"):
        return {"success": False, "error": "GEMINI_API_KEY is not set in environment."}

    # Word count
    wc = count_words(student_clean)
    word_count_feedback = generate_word_count_feedback(student_year, wc)

    # Too short -> no AI call
    if wc < MIN_AI_WORDS:
        data = _base_output_shape(student_year, text_type, max_total=max_total)
        data["meta"]["valid_response"] = False
        data["meta"]["message"] = (
            f"Text length is not enough to assess. Please write at least "
            f"{MIN_AI_WORDS} words (current: {wc})."
        )
        data["meta"]["word_count_feedback"] = {
            "word_count": wc,
            "year_level": student_year,
            "status": "too_short_for_ai",
            "message": "Text length is not enough to run NAPLAN evaluation.",
            "suggestion": "Add more sentences with clear ideas and details, then try again."
        }
        data["meta"]["prompt_relevance"] = {
            "score": 0,
            "verdict": "off_topic",
            "note": "Too little text to judge relevance.",
            "evidence": ""
        }
        data["overall"]["summary"] = "The response is too short to assess reliably."
        ensure_review_sections_shape(data)
        return {"success": True, "result": data}

    # Full evaluation
    try:
        data = _call_full_model(student_year, text_type, prompt_clean, student_clean, max_total)

        if not isinstance(data, dict):
            raise ValueError("Model returned non-dict JSON.")

        # Ensure required containers exist
        data.setdefault("meta", {})
        data.setdefault("overall", {})
        data.setdefault("criteria", [])
        data.setdefault("review_sections", [])

        # Force core meta fields
        data["meta"]["year_level"] = student_year
        data["meta"]["text_type"] = text_type
        data["meta"]["valid_response"] = True
        data["meta"]["word_count_feedback"] = word_count_feedback

        # ✅ keep model prompt_relevance if present; otherwise set default
        pr = data["meta"].get("prompt_relevance")
        if not isinstance(pr, dict) or "verdict" not in pr:
            data["meta"]["prompt_relevance"] = {
                "score": 100,
                "verdict": "on_topic",
                "note": "",
                "evidence": ""
            }

        # Normalize criteria + totals
        crits = data.get("criteria") or []
        crits, total_raw = normalize_criteria_list(crits, applicable_max, text_type)
        data["criteria"] = crits

        total_final = int(total_raw)

        # Fill overall scoring
        data["overall"]["max_score"] = max_total
        data["overall"]["total_score"] = total_final

        band = data["overall"].get("band") or band_from_score(total_final, max_total)
        band = sanitize_text(band, 32)
        if band not in ("Below Minimum Standard", "At Minimum Standard", "Above Minimum Standard"):
            band = band_from_score(total_final, max_total)
        data["overall"]["band"] = band

        # One-line summary sanity
        one_line = data["overall"].get("one_line_summary") or ""
        if not isinstance(one_line, str) or not one_line.strip():
            one_line = "Good effort. Keep practising and add more detail next time."
        data["overall"]["one_line_summary"] = sanitize_text(one_line, 140)

        # Summary sanity
        summ = data["overall"].get("summary") or ""
        if not isinstance(summ, str) or not summ.strip():
            summ = "Good effort. Keep practising and add more detail next time."
        data["overall"]["summary"] = sanitize_text(summ, 260)

        # Strengths/weaknesses sanity
        strengths = data["overall"].get("strengths")
        weaknesses = data["overall"].get("weaknesses")
        if not isinstance(strengths, list):
            strengths = []
        if not isinstance(weaknesses, list):
            weaknesses = []
        data["overall"]["strengths"] = [
            sanitize_text(x, 120) for x in strengths[:4] if isinstance(x, str) and x.strip()
        ]
        data["overall"]["weaknesses"] = [
            sanitize_text(x, 120) for x in weaknesses[:4] if isinstance(x, str) and x.strip()
        ]

        ensure_review_sections_shape(data)
        return {"success": True, "result": data}

    except Exception as e:
        out = _base_output_shape(student_year, text_type, max_total=max_total)
        out["meta"]["word_count_feedback"] = word_count_feedback
        out["meta"]["valid_response"] = False
        out["meta"]["message"] = "AI evaluation failed."
        out["meta"]["error_detail"] = sanitize_text(str(e), 260)

        # keep prompt relevance stable
        pr = out["meta"].get("prompt_relevance") or {}
        if not isinstance(pr, dict) or "verdict" not in pr:
            out["meta"]["prompt_relevance"] = {"score": 0, "verdict": "off_topic", "note": "", "evidence": ""}

        out["overall"]["summary"] = "Prompt relevance was checked, but full assessment failed."
        ensure_review_sections_shape(out)
        return {"success": True, "result": out}


# ----------------------------
# CLI
# ----------------------------
if __name__ == "__main__":
    payload = json.loads(sys.stdin.read() or "{}")

    out = evaluate_naplan_writing(
        int(payload["student_year"]),
        payload.get("writing_prompt", ""),
        payload.get("student_writing", ""),
        payload.get("text_type"),
    )

    print(json.dumps(out, ensure_ascii=True))
