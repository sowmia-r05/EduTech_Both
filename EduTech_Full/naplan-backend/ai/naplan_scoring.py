import json
import re
from typing import Any, Dict, List, Optional, Tuple

from ai.text_cleaning import sanitize_text, count_words

# ----------------------------
# NAPLAN max scores
# ----------------------------
MAX_SCORES = {
    "Audience": 6,
    "Text Structure": 6,
    "Ideas": 6,
    "Persuasive Devices": 5,  # N/A for narrative
    "Vocabulary": 6,
    "Cohesion": 5,
    "Paragraphing": 4,
    "Sentence Structure": 6,
    "Punctuation": 5,
    "Spelling": 6,
}

# ----------------------------
# NAPLAN word count ranges
# ----------------------------
WORD_RANGES = {
    3: {"min": 80, "max": 150, "strong_max": 200},
    5: {"min": 180, "max": 300, "strong_max": 350},
    7: {"min": 300, "max": 500, "strong_max": 600},
    9: {"min": 450, "max": 700, "strong_max": 700},
}


def guess_text_type(writing_prompt: str, student_writing: str) -> str:
    text = (writing_prompt + "\n" + student_writing).lower()
    persuasive_signals = [
        "convince", "persuade", "should", "must", "because",
        "i think", "i believe", "dear", "first", "second", "therefore",
        "in conclusion", "please"
    ]
    narrative_signals = [
        "one day", "once", "then", "suddenly", "after that",
        "the end", "story", "went", "found"
    ]
    p = sum(sig in text for sig in persuasive_signals)
    n = sum(sig in text for sig in narrative_signals)
    return "Persuasive" if p > n else "Narrative"


def extract_json(text: str) -> dict:
    """
    More robust: try full json first; else fall back to substring { ... } extraction.
    """
    text = (text or "").strip()
    if not text:
        raise ValueError("Empty model response.")

    # Try direct JSON
    try:
        return json.loads(text)
    except Exception:
        pass

    # Fallback: find first JSON object
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found in model response.")
    candidate = text[start:end + 1]
    return json.loads(candidate)


def build_schema_max(text_type: str) -> dict:
    applicable = dict(MAX_SCORES)
    if text_type == "Narrative":
        applicable["Persuasive Devices"] = None
    return applicable


def looks_meaningless(text: str) -> bool:
    t = (text or "").strip()
    if not t:
        return True
    alpha = re.sub(r"[^A-Za-z]+", " ", t)
    words = [w for w in alpha.split() if w]
    if len(words) < 5:
        return True
    if len(set(w.lower() for w in words)) < 3:
        return True
    if sum(c.isalpha() for c in t) < 20:
        return True
    return False


def year_level_expectation(year: int) -> str:
    if year == 3:
        return (
            "Expect simple sentences, basic vocabulary, and concrete ideas. "
            "Be age-appropriate and lenient. Focus on relevance to the prompt and clear events."
        )
    if year == 5:
        return (
            "Expect more detail, clearer sequencing, and some paragraph control. "
            "Use age-appropriate judgement."
        )
    if year == 7:
        return (
            "Expect controlled paragraphs, varied sentences, and clearer development of ideas. "
            "Use age-appropriate judgement."
        )
    if year == 9:
        return (
            "Expect well-structured writing, controlled language, and developed ideas. "
            "Use age-appropriate judgement."
        )
    return "Use age-appropriate expectations."


def band_from_score(total: int, max_score: int) -> str:
    if max_score <= 0:
        return "Below Minimum Standard"
    pct = (total / max_score) * 100.0
    if pct < 35:
        return "Below Minimum Standard"
    if pct < 65:
        return "At Minimum Standard"
    return "Above Minimum Standard"


def clamp_int(x: Any, lo: int, hi: int) -> int:
    try:
        v = int(x)
    except Exception:
        return lo
    return max(lo, min(hi, v))


def relevance_penalty_factor(relevance_score_0_100: int) -> float:
    r = clamp_int(relevance_score_0_100, 0, 100)
    if r >= 80:
        return 1.0
    if r >= 60:
        return 0.85
    if r >= 40:
        return 0.70
    if r >= 20:
        return 0.55
    return 0.40


def generate_word_count_feedback(year_level: int, word_count: int) -> dict:
    range_info = WORD_RANGES.get(year_level, WORD_RANGES[3])
    min_words = range_info["min"]
    max_words = range_info["max"]
    strong_max = range_info["strong_max"]

    feedback = {
        "word_count": word_count,
        "year_level": year_level,
        "status": "within_range",
        "message": "",
        "suggestion": ""
    }

    if word_count < min_words:
        feedback["status"] = "below_minimum"
        feedback["message"] = f"Word count ({word_count}) is below the expected minimum for Year {year_level}."
        feedback["suggestion"] = f"Aim for {min_words}-{max_words} words. Add more detail and examples to reach the target."
    elif word_count > strong_max:
        feedback["status"] = "above_maximum"
        feedback["message"] = f"Word count ({word_count}) exceeds the recommended maximum for Year {year_level}."
        feedback["suggestion"] = f"Try to be more concise. Target {min_words}-{max_words} words by combining ideas and removing repetition."
    elif word_count < max_words:
        feedback["status"] = "below_recommended"
        feedback["message"] = f"Word count ({word_count}) is within range but could be developed further."
        feedback["suggestion"] = f"Consider adding more detail to reach {min_words}-{max_words} words."
    else:
        feedback["status"] = "within_range"
        feedback["message"] = f"Word count ({word_count}) is within the expected range for Year {year_level}."
        feedback["suggestion"] = "Good length for this year level."

    return feedback


def ensure_review_sections_shape(data: dict) -> None:
    sections = data.get("review_sections")
    if not isinstance(sections, list):
        sections = []

    by_id = {}
    for s in sections:
        if isinstance(s, dict) and isinstance(s.get("id"), str):
            by_id[s["id"]] = s

    def get_section(sec_id: str, title: str):
        s = by_id.get(sec_id)
        if not isinstance(s, dict):
            s = {"id": sec_id, "title": title, "items": []}
            by_id[sec_id] = s
        if not isinstance(s.get("title"), str):
            s["title"] = title
        s["title"] = sanitize_text(s["title"], 80)
        if "items" not in s or not isinstance(s["items"], list):
            s["items"] = []
        return s

    sent = get_section("sentence_improvements", "Make these sentences stronger")
    ideas = get_section("ideas_development", "Ideas development suggestions")
    next_steps = get_section("next_steps", "Next time try this")
    mini = get_section("mini_rewrite", "Mini rewrite (example)")

    def sanitize_items(items, max_items=8):
        out = []
        for it in items[:max_items]:
            if isinstance(it, str):
                out.append(sanitize_text(it, 200))
            elif isinstance(it, dict):
                clean = {}
                for k, v in it.items():
                    clean[k] = sanitize_text(v, 260) if isinstance(v, str) else v
                out.append(clean)
        return out

    sent["items"] = sanitize_items(sent.get("items", []), 8)
    ideas["items"] = sanitize_items(ideas.get("items", []), 6)
    next_steps["items"] = sanitize_items(next_steps.get("items", []), 8)
    mini["items"] = sanitize_items(mini.get("items", []), 4)

    data["review_sections"] = [sent, ideas, next_steps, mini]


def canonicalize_criterion_name(name: str, applicable_max: dict) -> str:
    raw = sanitize_text(name or "", 40)
    if not raw:
        return ""
    lower_map = {k.lower(): k for k in applicable_max.keys()}
    hit = lower_map.get(raw.lower())
    return hit if hit else raw


def normalize_criteria_list(crits, applicable_max: dict, text_type: str) -> Tuple[List[Dict[str, Any]], int]:
    if not isinstance(crits, list):
        crits = []

    normalized: List[Dict[str, Any]] = []
    seen = set()
    total_raw = 0

    for c in crits:
        if not isinstance(c, dict):
            continue

        name = canonicalize_criterion_name(c.get("name") or "", applicable_max)
        if not name:
            continue

        key = name.lower()
        if key in seen:
            continue
        seen.add(key)

        mx = applicable_max.get(name, c.get("max"))

        if text_type == "Narrative" and name == "Persuasive Devices":
            normalized.append({
                "name": "Persuasive Devices",
                "score": None,
                "max": None,
                "suggestion": sanitize_text(c.get("suggestion") or "N/A (narrative)", 220),
                "evidence_quote": "",
            })
            continue

        if isinstance(mx, int):
            sc = c.get("score")
            if not isinstance(sc, int):
                sc = 0
            sc = clamp_int(sc, 0, mx)
            total_raw += sc
            score_val = sc
            max_val = mx
        else:
            score_val = c.get("score") if isinstance(c.get("score"), int) else 0
            max_val = mx if isinstance(mx, int) else 0

        sugg = c.get("suggestion") or ""
        evq = c.get("evidence_quote") or ""

        normalized.append({
            "name": name,
            "score": score_val,
            "max": max_val,
            "suggestion": sanitize_text(sugg, 220) if str(sugg).strip() else "Add more detail and check this area next time.",
            "evidence_quote": sanitize_text(evq, 220) if str(evq).strip() else "",
        })

    existing = {c["name"] for c in normalized if isinstance(c, dict) and isinstance(c.get("name"), str)}
    for name, mx in applicable_max.items():
        if name in existing:
            continue

        if text_type == "Narrative" and name == "Persuasive Devices":
            normalized.append({
                "name": "Persuasive Devices",
                "score": None,
                "max": None,
                "suggestion": "N/A (narrative)",
                "evidence_quote": ""
            })
        else:
            normalized.append({
                "name": name,
                "score": 0 if isinstance(mx, int) else 0,
                "max": mx if isinstance(mx, int) else 0,
                "suggestion": "Add more detail and check this area next time.",
                "evidence_quote": ""
            })

    return normalized, total_raw
