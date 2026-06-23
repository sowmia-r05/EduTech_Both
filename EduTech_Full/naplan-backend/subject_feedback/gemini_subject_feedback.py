import os
import json
import sys
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

try:
    import google.generativeai as genai
except ImportError:
    genai = None


# -------------------------
# Subject inference
# -------------------------
def infer_subject_from_quiz_name(quiz_name: str) -> str:
    """Infer subject from quiz name"""
    q = (quiz_name or "").lower()
    if "numeracy" in q or "mathematics" in q or "math" in q:
        return "Numeracy (Mathematics)"
    if ("language" in q and "convention" in q) or "convention" in q:
        return "Language Conventions"
    if "reading" in q:
        return "Reading"
    if "writing" in q:
        return "Writing"
    return "NAPLAN Assessment"


# -------------------------
# Year inference
# -------------------------
YEAR_RE = re.compile(r"\b(?:year|yr|grade)\s*([3579])\b", re.IGNORECASE)
YEAR_DIGIT_RE = re.compile(r"\b([3579])\s*(?:year|yr|grade)\b", re.IGNORECASE)


def infer_year_level(doc: Dict[str, Any], quiz_name: str) -> Optional[int]:
    """
    Try to infer year level from:
    - doc.year_level / doc.yearLevel
    - quiz name patterns like "Year3", "Year 3", "Grade 5" etc.
    """
    # 1) From doc
    for key in ("year_level", "yearLevel", "grade", "year"):
        v = doc.get(key)
        try:
            if isinstance(v, (int, float)) and int(v) in (3, 5, 7, 9):
                return int(v)
            if isinstance(v, str):
                vv = v.strip()
                if vv.isdigit() and int(vv) in (3, 5, 7, 9):
                    return int(vv)
        except Exception:
            pass

    # 2) From quiz_name
    q = (quiz_name or "")
    m = YEAR_RE.search(q) or YEAR_DIGIT_RE.search(q)
    if m:
        try:
            yr = int(m.group(1))
            if yr in (3, 5, 7, 9):
                return yr
        except Exception:
            pass

    # 3) From compact strings like Year3 / Yr5
    ql = (quiz_name or "").lower().replace(" ", "")
    for yr in (3, 5, 7, 9):
        if f"year{yr}" in ql or f"yr{yr}" in ql or f"grade{yr}" in ql:
            return yr

    return None


# -------------------------
# Numeric coercion (fixes Decimal128 / strings / extended json)
# -------------------------
def to_number(x: Any) -> Optional[float]:
    """Convert various numeric formats to float"""
    if isinstance(x, (int, float)):
        return float(x)

    if isinstance(x, str):
        s = x.strip()
        if not s:
            return None
        try:
            return float(s)
        except Exception:
            return None

    if isinstance(x, dict):
        # Mongo Extended JSON patterns (Decimal128, Int32, Int64)
        for k in ("$numberDecimal", "$numberInt", "$numberLong"):
            if k in x and isinstance(x[k], str):
                try:
                    return float(x[k])
                except Exception:
                    return None

    return None


def topic_scored_total(v: Dict[str, Any]) -> Optional[Tuple[float, float]]:
    """
    Extract scored/total from various topic formats.
    Accepts multiple topic shapes:
    - {scored, total}
    - {points, available}
    - {points_scored, points_available}
    - {correct, attempted}
    """
    pairs = [
        ("scored", "total"),
        ("points", "available"),
        ("points_scored", "points_available"),
        ("correct", "attempted"),
    ]
    for a, b in pairs:
        sa = to_number(v.get(a))
        sb = to_number(v.get(b))
        if sa is not None and sb is not None:
            return sa, sb
    return None


# -------------------------
# Normalize input doc -> student_data
# -------------------------
def normalize_student_data(doc: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Normalize various input formats to standard structure"""
    score_obj = doc.get("score") or {}
    percentage: Optional[float] = None
    grade: Optional[str] = None

    if isinstance(score_obj, dict):
        percentage = to_number(score_obj.get("percentage"))
        if isinstance(score_obj.get("grade"), str):
            grade = score_obj["grade"]

        if percentage is None:
            pts = to_number(score_obj.get("points"))
            avail = to_number(score_obj.get("available"))
            if pts is not None and avail is not None and avail > 0:
                percentage = (pts / avail) * 100.0

    topic_obj = doc.get("topicBreakdown")

    normalized_topics: List[Dict[str, Any]] = []

    if isinstance(topic_obj, dict):
        for k, v in topic_obj.items():
            if not isinstance(v, dict):
                continue
            st = topic_scored_total(v)
            if not st:
                continue
            scored, total = st
            normalized_topics.append({
                "name": str(k),
                "scored": float(scored),
                "total": float(total)
            })

    if not normalized_topics:
        return None, "Missing/empty topicBreakdown (expected an object with {topic:{scored,total}} or compatible keys)"

    if percentage is None:
        total_scored = sum(x["scored"] for x in normalized_topics)
        total_total = sum(x["total"] for x in normalized_topics)
        if total_total > 0:
            percentage = (total_scored / total_total) * 100.0

    if percentage is None:
        return None, "Missing overall percentage (score.percentage or score.points/available or computable from topics)"

    return {
        "total_score": {"percentage": float(percentage), "grade": grade},
        "sub_subjects": normalized_topics,
    }, None


# -------------------------
# First session / no attempts detection
# -------------------------
def is_no_attempt_session(doc: Dict[str, Any], topics: List[Dict[str, Any]]) -> bool:
    """Check if this is a session with no actual attempts"""
    total_total = 0.0
    for t in topics:
        try:
            total_total += float(t.get("total", 0) or 0)
        except Exception:
            pass
    return total_total <= 0.0


# -------------------------
# Timing evaluation helpers
# -------------------------
def compute_time_metrics(doc: Dict[str, Any], topics: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Returns:
      time_taken_minutes: float|None
      total_questions: int
      seconds_per_question: float|None
    """
    duration = doc.get("duration")
    time_taken_minutes: Optional[float] = None

    d = to_number(duration) if duration is not None else None
    if d is not None:
        secs = d / 1000.0 if d > 100000 else d
        time_taken_minutes = round(secs / 60.0, 1)

    total_questions = 0
    for t in topics:
        try:
            total_questions += int(float(t.get("total") or 0))
        except Exception:
            pass

    seconds_per_question: Optional[float] = None
    if time_taken_minutes is not None and total_questions > 0:
        seconds_per_question = round((time_taken_minutes * 60.0) / total_questions, 1)

    return {
        "time_taken_minutes": time_taken_minutes,
        "total_questions": total_questions,
        "seconds_per_question": seconds_per_question,
    }


def pace_label(year_level: Optional[int], seconds_per_question: Optional[float]) -> str:
    """
    Simple pace classifier. You can tune these thresholds anytime.
    """
    if seconds_per_question is None:
        return "unknown"

    # Slightly more generous for younger years
    if year_level == 3:
        fast, slow = 25, 70
    elif year_level == 5:
        fast, slow = 22, 60
    elif year_level == 7:
        fast, slow = 20, 55
    elif year_level == 9:
        fast, slow = 18, 50
    else:
        fast, slow = 20, 60

    if seconds_per_question < fast:
        return "fast"
    if seconds_per_question > slow:
        return "slow"
    return "steady"


# -------------------------
# Performance analysis
# -------------------------
def analyze_performance(student_data: Dict[str, Any], doc: Dict[str, Any], year_level: Optional[int]) -> Dict[str, Any]:
    topics = student_data["sub_subjects"]

    overall_pct = float(student_data["total_score"]["percentage"])
    grade = student_data["total_score"].get("grade") or ""

    # Topic-level percentages
    topic_perf: List[Dict[str, Any]] = []
    high = 0
    low = 0

    for t in topics:
        total = float(t.get("total") or 0)
        if total == 0:
            continue

        scored = float(t.get("scored") or 0)
        pct = (scored / total) * 100.0
        missed = max(0.0, total - scored)

        topic_perf.append({
            "name": t["name"],
            "percentage": round(pct, 1),
            "scored": scored,
            "total": total,
            "missed": round(missed, 1),
        })

        if pct >= 80:
            high += 1
        elif pct <= 30:
            low += 1

    topic_perf.sort(key=lambda x: x["percentage"], reverse=True)

    top_topics = topic_perf[:3] if len(topic_perf) >= 3 else topic_perf

    if len(topic_perf) >= 3:
        weak_topics = list(reversed(topic_perf[-3:]))
    else:
        weak_topics = list(reversed(topic_perf))

    # Timing metrics
    tm = compute_time_metrics(doc, topics)
    pace = pace_label(year_level, tm.get("seconds_per_question"))

    return {
        "year_level": year_level,
        "overall_percentage": round(overall_pct, 1),
        "accuracy": round(overall_pct, 1),
        "grade": grade,
        "time_taken_minutes": tm.get("time_taken_minutes"),
        "total_questions": tm.get("total_questions"),
        "seconds_per_question": tm.get("seconds_per_question"),
        "pace": pace,  # fast|steady|slow|unknown
        "high_performance_count": int(high),
        "low_performance_count": int(low),
        "all_topics": topic_perf,
        "top_topics": top_topics,
        "weak_topics": weak_topics,
    }


# ═══════════════════════════════════════════════════════════════
# PROVIDERS: Gemini primary + OpenAI fallback
# ═══════════════════════════════════════════════════════════════
# Build whichever providers have keys present, ordered by priority.
# generate_feedback() tries them in order and falls back on ANY error
# (billing 429, rate limit, timeout, empty/invalid response, etc.).
# Override priority with AI_PRIMARY_PROVIDER = "openai" | "gemini".

def _make_openai() -> Optional[Dict[str, Any]]:
    if OpenAI is None:  # 👈 CHANGED: skip cleanly if the openai library isn't installed
        return None
    key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not key:
        return None
    model = (os.getenv("OPENAI_MODEL") or "gpt-4o-mini").strip()
    return {"provider": "openai", "client": OpenAI(api_key=key), "model": model}


def _make_gemini() -> Optional[Dict[str, Any]]:
    if genai is None:  # 👈 CHANGED: skip cleanly if google-generativeai isn't installed
        return None
    key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not key:
        return None
    model = (os.getenv("GEMINI_MODEL") or "gemini-2.5-flash-lite").strip()  # 👈 CHANGED: was "gemini-2.0-flash"
    genai.configure(api_key=key)
    return {"provider": "gemini", "client": genai.GenerativeModel(model), "model": model}


def init_providers() -> List[Dict[str, Any]]:
    """Return available providers, primary first. Empty list if no keys set."""
    primary = (os.getenv("AI_PRIMARY_PROVIDER") or "gemini").strip().lower()  # 👈 CHANGED: was "openai"
    openai_p = _make_openai()
    gemini_p = _make_gemini()
    order = [gemini_p, openai_p] if primary == "gemini" else [openai_p, gemini_p]
    return [p for p in order if p]


def _call_openai(p: Dict[str, Any], prompt: str) -> str:
    resp = p["client"].chat.completions.create(
        model=p["model"],
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
        max_tokens=1500,
        response_format={"type": "json_object"},
    )
    return resp.choices[0].message.content or ""


def _call_gemini(p: Dict[str, Any], prompt: str) -> str:
    resp = p["client"].generate_content(
        prompt,
        generation_config={"temperature": 0.7, "max_output_tokens": 1500},
    )
    return getattr(resp, "text", "") or ""


def tone_guidance(year_level: Optional[int]) -> str:
    """
    Year-based tone changes.
    """
    if year_level == 3:
        return "Use very simple words, short sentences, warm and encouraging."
    if year_level == 5:
        return "Use simple clear language, slightly more detailed steps."
    if year_level == 7:
        return "Use confident coaching tone, practical strategies, more independence."
    if year_level == 9:
        return "Use mature, direct coaching tone, exam-strategy focus, self-reflection."
    return "Use supportive, clear, actionable tone."


# 👈 ADDED: difficulty label derived from how the student scored on a passage.
def passage_difficulty_label(pct: float) -> str:
    if pct >= 75:
        return "comfortable"
    if pct >= 50:
        return "manageable"
    return "challenging"


# 👈 ADDED: Reading-only prompt. Frames feedback around PASSAGE DIFFICULTY
# (derived from score), never skills/sub-topics. Same JSON shape as the
# standard prompt so the frontend renders it identically.
def build_reading_prompt(analysis: Dict[str, Any], year_level: Optional[int],
                         product_insights: Optional[List[str]] = None) -> str:
    accuracy = analysis.get("accuracy")
    pace = analysis.get("pace")
    time_taken = analysis.get("time_taken_minutes")
    spq = analysis.get("seconds_per_question")

    time_str = f"{time_taken} minutes" if time_taken is not None else "not recorded"
    spq_str = f"{spq} sec/question" if spq is not None else "not available"

    passages = analysis.get("all_topics") or []
    lines = []
    for p in passages:
        label = passage_difficulty_label(p["percentage"])
        lines.append(
            f"{p['name']} — {p['percentage']}% "
            f"({int(p['scored'])}/{int(p['total'])}) → {label} for this student"
        )
    passage_block = "\n  • ".join(lines) if lines else "No passage data available"

    insights_block = ""
    if product_insights:
        insights_block = "\n\nProduct Style Guidelines:\n• " + "\n• ".join(product_insights)

    tone_block = f"YEAR LEVEL: Year {year_level if year_level else 'Unknown'}\nTONE RULE: {tone_guidance(year_level)}"

    return f"""You are an expert AI Reading Coach creating personalized feedback for a Reading comprehension assessment.

AUDIENCE: Student + Parent/Teacher
{tone_block}

═══════════════════════════════════════════════════════════════
READING FEEDBACK RULES (READ CAREFULLY):
═══════════════════════════════════════════════════════════════
- Reading questions are grouped by PASSAGE, not by skill or sub-topic.
- Do NOT give skill-by-skill or topic-by-topic study tips.
- Frame everything around PASSAGE DIFFICULTY, judged from this student's score:
   - A LOW score on a passage means it was a harder / longer / trickier passage.
     Reassure the student that tougher passages are completely normal, and give ONE
     gentle, GENERAL reading strategy. NEVER say or imply the student is bad at reading.
   - A HIGH score means praise — they handled a solid passage confidently.
- You MAY name a passage, but only to say how hard or easy it was — never as a
  "topic to study".

═══════════════════════════════════════════════════════════════
PERFORMANCE DATA:
═══════════════════════════════════════════════════════════════
Overall Reading Score: {accuracy}%
Time: {time_str}  |  Speed: {spq_str}  |  Pace: {pace}

PASSAGES (with difficulty for this student):
  • {passage_block}

TIMING RULE:
- Mention timing in overall_feedback (1 sentence).
{insights_block}

═══════════════════════════════════════════════════════════════
OUTPUT REQUIREMENTS:
═══════════════════════════════════════════════════════════════

Return ONLY valid JSON (no markdown, no code blocks, no extra text).

Required JSON structure:
{{
  "overall_feedback": "EXACTLY 2 short sentences, max 14 words each.",
  "coach": [
    {{"insight":"...","reason":"...","action":"..."}},
    {{"insight":"...","reason":"...","action":"..."}},
    {{"insight":"...","reason":"...","action":"..."}}
  ],
  "strengths": ["3 points praising passages handled well, max 10 words each", "...", "..."],
  "weaknesses": ["3 points framing harder passages gently, max 10 words each", "...", "..."],
  "growth_areas": ["3 points, max 10 words each", "...", "..."],
  "study_tips": ["up to 3 GENERAL reading strategies, max 10 words each", "...", "..."],

  "topic_wise_tips": [
    {{"topic":"Challenging passages","tips":["<=14 words","<=14 words"]}},
    {{"topic":"Passages you handled well","tips":["<=14 words"]}}
  ],

  "cta": "One motivating call-to-action (12 words max)",
  "encouragement": "4-5 short sentences, supportive and specific."
}}

CHECKLIST:
- Talk about PASSAGE DIFFICULTY, not skills or sub-topics.
- A low passage score = a harder passage + reassurance, never blame.
- topic_wise_tips group by difficulty ("Challenging passages" / "Passages you handled well").
- study_tips are GENERAL reading strategies, not passage-specific drills.
- Include timing in overall_feedback (1 sentence).
""".strip()


# 👈 ADDED: Reading-only schema coercion. Same output keys as
# coerce_ai_feedback_schema, but builds difficulty-framed fallbacks and never
# injects a passage name as a "study topic".
def coerce_reading_feedback_schema(ai: Dict[str, Any], analysis: Dict[str, Any]) -> Dict[str, Any]:
    ai = ai if isinstance(ai, dict) else {}

    def arr(x):
        return x if isinstance(x, list) else []

    def ensure_string(x):
        return str(x).strip() if x else ""

    def clamp_words(s: str, max_words: int) -> str:
        s = (s or "").strip()
        return " ".join(s.split()[:max_words]) if s else ""

    accuracy = analysis.get("accuracy")
    pace = analysis.get("pace") or "unknown"
    time_taken = analysis.get("time_taken_minutes")
    spq = analysis.get("seconds_per_question")

    passages = analysis.get("all_topics") or []
    challenging = sorted([p for p in passages if p["percentage"] < 50],
                         key=lambda x: x["percentage"])
    comfortable = sorted([p for p in passages if p["percentage"] >= 75],
                         key=lambda x: x["percentage"], reverse=True)

    GENERAL_TIPS = [
        "Reread the question before scanning the passage.",
        "Skim for keywords, then read that part closely.",
        "Underline who, what and where as you read.",
        "Check every option back against the text.",
    ]

    # ---- COACH (3) ----
    coach_items = []
    for item in arr(ai.get("coach")):
        if isinstance(item, dict):
            i = ensure_string(item.get("insight"))
            r = ensure_string(item.get("reason"))
            a = ensure_string(item.get("action"))
            if i and r and a:
                coach_items.append({"insight": i, "reason": r, "action": a})
    coach_items = coach_items[:3]
    while len(coach_items) < 3:
        idx = len(coach_items)
        if idx < len(challenging):
            p = challenging[idx]
            coach_items.append({
                "insight": f"The '{p['name']}' passage was a tougher one.",
                "reason": f"You scored {p['percentage']}% there — harder passages are normal.",
                "action": clamp_words(GENERAL_TIPS[idx % len(GENERAL_TIPS)], 14),
            })
        else:
            coach_items.append({
                "insight": "Short daily reading builds comprehension confidence.",
                "reason": "Regular practice makes tricky passages feel easier.",
                "action": "Read one short passage and answer 5 questions daily.",
            })

    # ---- STRENGTHS (3) — praise comfortable passages ----
    strengths = [ensure_string(x) for x in arr(ai.get("strengths")) if ensure_string(x)][:3]
    for p in comfortable:
        if len(strengths) >= 3:
            break
        if p["name"].lower() not in " ".join(strengths).lower():
            strengths.append(f"Handled the '{p['name']}' passage well ({p['percentage']}%)")
    if pace == "fast" and spq is not None and len(strengths) < 3:
        strengths.append(f"Good reading pace: {spq}s per question")
    STRENGTH_FILL = [
        "Stayed focused through the whole test",
        "Worked steadily across every passage",
        "Kept going even on the longer passages",
    ]
    sf = 0
    while len(strengths) < 3 and sf < len(STRENGTH_FILL):
        if STRENGTH_FILL[sf] not in strengths:
            strengths.append(STRENGTH_FILL[sf])
        sf += 1
    strengths = strengths[:3]

    # ---- WEAKNESSES (3) — passage difficulty, never blame ----
    weaknesses = [ensure_string(x) for x in arr(ai.get("weaknesses")) if ensure_string(x)][:3]
    for p in challenging:
        if len(weaknesses) >= 3:
            break
        if p["name"].lower() not in " ".join(weaknesses).lower():
            weaknesses.append(f"The '{p['name']}' passage was a challenging one")
    if pace == "slow" and spq is not None and len(weaknesses) < 3:
        weaknesses.append(f"Reading pace was a little slow: {spq}s/question")
    WEAK_FILL = [
        "Some longer passages need a careful second read",
        "Tricky questions are worth a slower, closer look",
        "Building stamina on long passages will help",
    ]
    wf = 0
    while len(weaknesses) < 3 and wf < len(WEAK_FILL):
        if WEAK_FILL[wf] not in weaknesses:
            weaknesses.append(WEAK_FILL[wf])
        wf += 1
    weaknesses = weaknesses[:3]

    # ---- GROWTH AREAS (3) ----
    growth_areas = [ensure_string(x) for x in arr(ai.get("growth_areas")) if ensure_string(x)][:3]
    for p in challenging:
        if len(growth_areas) >= 3:
            break
        if p["name"].lower() not in " ".join(growth_areas).lower():
            growth_areas.append(f"Build confidence on harder passages like '{p['name']}'")
    GROWTH_FILL = [
        "Practice longer passages to build reading stamina",
        "Slow down and reread before answering",
        "Review the questions you found tricky",
    ]
    gf = 0
    while len(growth_areas) < 3 and gf < len(GROWTH_FILL):
        if GROWTH_FILL[gf] not in growth_areas:
            growth_areas.append(GROWTH_FILL[gf])
        gf += 1
    growth_areas = growth_areas[:3]

    # ---- STUDY TIPS — general reading strategies ----
    study_tips = [ensure_string(x) for x in arr(ai.get("study_tips")) if ensure_string(x)][:3]
    i = 0
    while len(study_tips) < 3 and i < len(GENERAL_TIPS):
        if GENERAL_TIPS[i] not in study_tips:
            study_tips.append(GENERAL_TIPS[i])
        i += 1
    study_tips = study_tips[:3]

    # ---- TOPIC-WISE TIPS — grouped by DIFFICULTY, not passage/skill ----
    topic_wise_tips: List[Dict[str, Any]] = []
    if challenging:
        top_hard = challenging[:2]
        names = ", ".join(f"'{p['name']}'" for p in top_hard)
        verb = "was" if len(top_hard) == 1 else "were"
        topic_wise_tips.append({
            "topic": "Challenging passages",
            "tips": [
                clamp_words(f"{names} {verb} tougher — that is completely normal.", 14),
                "Reread the question, then skim the passage for keywords.",
            ],
        })
    if comfortable:
        names = ", ".join(f"'{p['name']}'" for p in comfortable[:2])
        topic_wise_tips.append({
            "topic": "Passages you handled well",
            "tips": [
                clamp_words(f"Great work on {names}.", 14),
                "Keep using the strategies that worked here.",
            ],
        })
    if not topic_wise_tips:
        topic_wise_tips.append({
            "topic": "Building reading stamina",
            "tips": [
                "Read one short passage and answer questions daily.",
                "Slow down on long passages and reread tricky parts.",
            ],
        })
    topic_wise_tips = topic_wise_tips[:3]

    # ---- OVERALL FEEDBACK (must mention timing) ----
    overall_feedback = ensure_string(ai.get("overall_feedback"))
    if not overall_feedback:
        if challenging:
            overall_feedback = (f"You scored {accuracy}% overall; some passages were "
                                f"harder than others. Keep practising and you will grow.")
        else:
            overall_feedback = (f"Solid reading at {accuracy}% overall. "
                                f"You handled the passages confidently.")
    if time_taken is not None and ("minute" not in overall_feedback.lower()) and ("time" not in overall_feedback.lower()):
        overall_feedback = f"{overall_feedback} Time taken: {time_taken} minutes."

    cta = ensure_string(ai.get("cta")) or "Read one passage a day and beat your last score."
    encouragement = ensure_string(ai.get("encouragement")) or (
        "Every passage you read makes the next one easier. "
        "Harder passages are a chance to grow, not a setback. "
        "Keep reading a little each day. "
        "You are improving with every test."
    )

    return {
        "overall_feedback": overall_feedback,
        "coach": coach_items,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "growth_areas": growth_areas,
        "study_tips": study_tips,
        "topic_wise_tips": topic_wise_tips,
        "cta": cta,
        "encouragement": encouragement,
    }


def build_gemini_prompt(analysis: Dict[str, Any], subject: str, product_insights: Optional[List[str]] = None) -> str:
    def fmt_topics(items: List[Dict[str, Any]]) -> str:
        if not items:
            return "None"
        parts = []
        for x in items:
            missed = int(x.get("missed", 0))
            total = int(x.get("total", 0))
            parts.append(
                f"{x['name']} - {x['percentage']}% correct "
                f"({int(x['scored'])}/{total} questions, {missed} missed)"
            )
        return "\n  • ".join(parts)

    year_level = analysis.get("year_level")
    top_str = fmt_topics(analysis.get("top_topics") or [])
    weak_str = fmt_topics(analysis.get("weak_topics") or [])

    weak_topics_list = analysis.get("weak_topics") or []
    weakest_topic = weak_topics_list[0] if weak_topics_list else None

    time_taken = analysis.get("time_taken_minutes")
    total_q = analysis.get("total_questions")
    spq = analysis.get("seconds_per_question")
    pace = analysis.get("pace")

    time_str = f"{time_taken} minutes" if time_taken is not None else "not recorded"
    spq_str = f"{spq} sec/question" if spq is not None else "not available"

    weakness_instructions = ""
    if weakest_topic:
        weakness_instructions = f"""
⚠️ CRITICAL REQUIREMENT - WEAKEST TOPIC:
The weakest performing topic is: "{weakest_topic['name']}"
Performance: {weakest_topic['percentage']}% ({int(weakest_topic['scored'])}/{int(weakest_topic['total'])} correct, {int(weakest_topic['missed'])} missed)

YOU MUST:
1) Include "{weakest_topic['name']}" as FIRST item in weaknesses AND growth_areas.
2) Create at least ONE coach item about "{weakest_topic['name']}" with an actionable task.
3) Include a study_tip specifically for "{weakest_topic['name']}".
4) topic_wise_tips[0].topic MUST be "{weakest_topic['name']}".

If "{weakest_topic['name']}" is missing from weaknesses, the output is INVALID.
"""

    timing_instructions = f"""
⏱️ TIMING REQUIREMENT:
Time taken: {time_str}
Total questions: {total_q}
Speed: {spq_str}
Pace label: {pace}

RULE:
- Mention timing in overall_feedback (1 sentence).
- If pace is "slow", include timing as a weakness point.
- If pace is "fast", include timing as a strength point (but warn about accuracy if needed).
- If pace is "steady", mention it positively (neutral/strength).
"""

    insights_block = ""
    if product_insights:
        insights_block = "\n\nProduct Style Guidelines:\n• " + "\n• ".join(product_insights)

    tone_block = f"YEAR LEVEL: Year {year_level if year_level else 'Unknown'}\nTONE RULE: {tone_guidance(year_level)}"

    return f"""You are an expert AI Coach creating personalized feedback for a {subject} assessment.

AUDIENCE: Student + Parent/Teacher
{tone_block}

═══════════════════════════════════════════════════════════════
PERFORMANCE DATA:
═══════════════════════════════════════════════════════════════
Overall Score: {analysis.get('accuracy')}%
Time: {time_str}  |  Speed: {spq_str}  |  Pace: {pace}
High performers (≥80%): {analysis.get('high_performance_count')} topics
Low performers (≤30%): {analysis.get('low_performance_count')} topics

STRONGEST TOPICS:
  • {top_str}

WEAKEST TOPICS:
  • {weak_str}

{weakness_instructions}
{timing_instructions}
{insights_block}

═══════════════════════════════════════════════════════════════
OUTPUT REQUIREMENTS:
═══════════════════════════════════════════════════════════════

Return ONLY valid JSON (no markdown, no code blocks, no extra text).

Required JSON structure:
{{
  "overall_feedback": "EXACTLY 2 short sentences, max 14 words each.",
  "coach": [
    {{"insight":"...","reason":"...","action":"..."}},
    {{"insight":"...","reason":"...","action":"..."}},
    {{"insight":"...","reason":"...","action":"..."}}
  ],
  "strengths": ["3 points, max 10 words each", "...", "..."],
  "weaknesses": ["3 points, max 10 words each", "...", "..."],
  "growth_areas": ["3 points, max 10 words each", "...", "..."],
  "study_tips": ["up to 3 items, max 10 words each", "...", "..."],

  "topic_wise_tips": [
    {{"topic":"<topic name>","tips":["<=14 words","<=14 words"]}},
    {{"topic":"<topic name>","tips":["<=14 words","<=14 words"]}},
    {{"topic":"<topic name>","tips":["<=14 words","<=14 words"]}}
  ],

  "cta": "One motivating call-to-action (12 words max)",
  "encouragement": "4-5 short sentences, supportive and specific."
}}

CHECKLIST:
- weaknesses MUST exist and have 3 points
- weaknesses[0] MUST be the weakest topic name
- topic_wise_tips MUST exist and have 3 items
- topic_wise_tips topics MUST match weak topics (use real names)
- topic_wise_tips[0].topic MUST be the weakest topic
- Include timing in overall_feedback (1 sentence)
- Use real topic names and real numbers
- Actions must include a number + time or quantity
""".strip()


def safe_json_from_text(text: str) -> Dict[str, Any]:
    text = (text or "").strip()

    if "```" in text:
        lines = text.split("\n")
        json_lines = []
        in_block = False
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("```"):
                if in_block:
                    break
                in_block = True
                continue
            if in_block:
                json_lines.append(line)
        if json_lines:
            text = "\n".join(json_lines).strip()

    try:
        return json.loads(text)
    except Exception:
        pass

    start = text.find("{")
    end = text.rfind("}") + 1
    if start == -1 or end <= 0:
        raise ValueError(f"Model did not return a JSON object. Response was: {text[:200]}")

    clean = text[start:end]
    try:
        return json.loads(clean)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON from model: {str(e)}\nContent: {clean[:200]}")


def generate_feedback(providers: List[Dict[str, Any]], prompt: str, max_retries: int = 2) -> Tuple[Dict[str, Any], str, str]:
    """
    Try each provider in priority order. Within a provider, retry up to
    max_retries. On full failure, fall back to the next provider.
    Returns (parsed_feedback, model_used, provider_used).
    """
    last_error = None
    for p in providers:
        for attempt in range(max_retries):
            try:
                if p["provider"] == "openai":
                    text = _call_openai(p, prompt)
                else:
                    text = _call_gemini(p, prompt)
                if not text:
                    raise ValueError("Empty response from model")
                parsed = safe_json_from_text(text)
                return parsed, p["model"], p["provider"]
            except Exception as e:
                last_error = e
                # exhausted retries for this provider -> fall through to next
        # next provider
    raise ValueError(f"All providers failed. Last error: {str(last_error)}")


# -------------------------
# Schema coercion + fallback
# Ensures weaknesses ALWAYS appear + timing appears + topic_wise_tips (NEW SHAPE)
# -------------------------
def coerce_ai_feedback_schema(ai: Dict[str, Any], analysis: Dict[str, Any], subject: str) -> Dict[str, Any]:
    ai = ai if isinstance(ai, dict) else {}

    def arr(x):
        return x if isinstance(x, list) else []

    def ensure_string(x):
        return str(x).strip() if x else ""

    def clamp_words(s: str, max_words: int) -> str:
        s = (s or "").strip()
        if not s:
            return ""
        parts = s.split()
        return " ".join(parts[:max_words])

    weak_topics = analysis.get("weak_topics") or []
    top_topics = analysis.get("top_topics") or []
    weakest_topic = weak_topics[0] if weak_topics else None

    pace = analysis.get("pace") or "unknown"
    time_taken = analysis.get("time_taken_minutes")
    spq = analysis.get("seconds_per_question")

    # ---- COACH (3 items) ----
    coach_items = []
    for item in arr(ai.get("coach")):
        if not isinstance(item, dict):
            continue
        insight = ensure_string(item.get("insight"))
        reason = ensure_string(item.get("reason"))
        action = ensure_string(item.get("action"))
        if insight and reason and action:
            coach_items.append({"insight": insight, "reason": reason, "action": action})
    coach_items = coach_items[:3]

    # Ensure weakest topic appears in coach
    weakest_mentioned_in_coach = False
    if weakest_topic:
        for it in coach_items:
            if weakest_topic["name"].lower() in it["insight"].lower() or weakest_topic["name"].lower() in it["reason"].lower():
                weakest_mentioned_in_coach = True
                break

    while len(coach_items) < 3:
        idx = len(coach_items)
        if idx < len(weak_topics):
            topic = weak_topics[idx]
            missed = int(topic.get("missed", 0))
            total = int(topic.get("total", 0))
            coach_items.append({
                "insight": f"{topic['name']} needs focused practice to improve.",
                "reason": f"You missed {missed} out of {total} questions here.",
                "action": f"Do 10 {topic['name']} questions in 15 minutes today.",
            })
        else:
            coach_items.append({
                "insight": "Small daily practice builds strong long-term skills.",
                "reason": "Repeating key patterns helps you remember faster.",
                "action": "Study for 15 minutes daily and review mistakes.",
            })

    # If weakest topic not mentioned anywhere in coach, force replace last
    if weakest_topic and not weakest_mentioned_in_coach and coach_items:
        topic = weakest_topic
        missed = int(topic.get("missed", 0))
        total = int(topic.get("total", 0))
        coach_items[-1] = {
            "insight": f"{topic['name']} is the biggest improvement opportunity.",
            "reason": f"You missed {missed} out of {total} questions in {topic['name']}.",
            "action": f"Practice 12 {topic['name']} questions tomorrow (20 minutes).",
        }

    # ---- STRENGTHS (3) ----
    strengths = [ensure_string(x) for x in arr(ai.get("strengths")) if ensure_string(x)][:3]
    while len(strengths) < min(3, len(top_topics)):
        topic = top_topics[len(strengths)]
        strengths.append(f"{topic['name']}: {topic['percentage']}% accuracy")

    # Timing as strength if fast
    if pace == "fast" and time_taken is not None and spq is not None:
        timing_strength = f"Good speed: {spq}s per question"
        if timing_strength.lower() not in " ".join(strengths).lower():
            if len(strengths) < 3:
                strengths.append(timing_strength)
            else:
                strengths[-1] = timing_strength

    strengths = strengths[:3]

    # ---- WEAKNESSES (3) ----
    weaknesses = [ensure_string(x) for x in arr(ai.get("weaknesses")) if ensure_string(x)][:3]

    # Ensure weakest topic is first weakness
    if weakest_topic:
        first = f"{weakest_topic['name']}: low accuracy"
        if not weaknesses:
            weaknesses = [first]
        else:
            if weakest_topic["name"].lower() not in weaknesses[0].lower():
                weaknesses = [first] + [w for w in weaknesses if w]

    # Fill weaknesses from weak topics
    for topic in weak_topics[:3]:
        if len(weaknesses) >= 3:
            break
        if topic["name"].lower() not in " ".join(weaknesses).lower():
            weaknesses.append(f"{topic['name']}: {topic['percentage']}% accuracy")

    # Timing as weakness if slow
    if pace == "slow" and time_taken is not None and spq is not None:
        timing_weakness = f"Too slow: {spq}s per question"
        if timing_weakness.lower() not in " ".join(weaknesses).lower():
            if len(weaknesses) < 3:
                weaknesses.append(timing_weakness)
            else:
                weaknesses[-1] = timing_weakness

    # Ensure exactly 3 weaknesses
    while len(weaknesses) < 3:
        weaknesses.append("Needs more practice consistency")
    weaknesses = weaknesses[:3]

    # ---- GROWTH AREAS (3) ----
    growth_areas = [ensure_string(x) for x in arr(ai.get("growth_areas")) if ensure_string(x)][:3]

    # Ensure weakest topic is first growth area
    if weakest_topic:
        must_first = f"{weakest_topic['name']}: practice daily"
        if not growth_areas:
            growth_areas = [must_first]
        else:
            if weakest_topic["name"].lower() not in growth_areas[0].lower():
                growth_areas = [must_first] + [g for g in growth_areas if g]

    # Fill growth_areas from weak topics
    for topic in weak_topics[:3]:
        if len(growth_areas) >= 3:
            break
        if topic["name"].lower() not in " ".join(growth_areas).lower():
            growth_areas.append(f"{topic['name']}: improve by revising mistakes")

    while len(growth_areas) < 3:
        growth_areas.append("Improve accuracy by checking answers")
    growth_areas = growth_areas[:3]

    # ---- STUDY TIPS (up to 3) ----
    study_tips = [ensure_string(x) for x in arr(ai.get("study_tips")) if ensure_string(x)][:3]

    if weakest_topic:
        if not any(weakest_topic["name"].lower() in t.lower() for t in study_tips):
            study_tips = [f"Practice {weakest_topic['name']} 10 minutes daily"] + study_tips

    # Keep max 3
    study_tips = study_tips[:3]

    # ---- TOPIC-WISE TIPS (NEW SHAPE) ----
    # Expect: [{"topic": "...", "tips": ["...", "..."]}, ...]
    topic_wise_tips: List[Dict[str, Any]] = []
    raw = ai.get("topic_wise_tips")

    def normalize_tips_list(x) -> List[str]:
        if not isinstance(x, list):
            return []
        out = []
        for t in x:
            tt = clamp_words(str(t).strip(), 14)
            if tt:
                out.append(tt)
        return out[:3]  # 1–3 bullets

    if isinstance(raw, list):
        for it in raw:
            if not isinstance(it, dict):
                continue
            topic = ensure_string(it.get("topic"))
            tips_list = normalize_tips_list(it.get("tips"))
            if topic and tips_list:
                topic_wise_tips.append({"topic": topic, "tips": tips_list})

    weak3 = weak_topics[:3]

    def default_topic_block(topic_name: str) -> Dict[str, Any]:
        return {
            "topic": topic_name,
            "tips": [
                clamp_words(f"Practice {topic_name} for 10 minutes daily.", 14),
                clamp_words("Review mistakes and redo similar questions.", 14),
            ],
        }

    # Ensure weakest topic is FIRST
    if weakest_topic:
        wk = weakest_topic["name"]
        if not topic_wise_tips:
            topic_wise_tips = [default_topic_block(wk)]
        else:
            if wk.lower() not in (topic_wise_tips[0].get("topic", "").lower()):
                existing_idx = None
                for i, t in enumerate(topic_wise_tips):
                    if wk.lower() in (t.get("topic", "").lower()):
                        existing_idx = i
                        break
                if existing_idx is not None:
                    item = topic_wise_tips.pop(existing_idx)
                    topic_wise_tips.insert(0, item)
                else:
                    topic_wise_tips.insert(0, default_topic_block(wk))

    # Fill remaining topics using weak topics
    for t in weak3:
        if len(topic_wise_tips) >= 3:
            break
        name = t["name"]
        if name.lower() not in " ".join(x["topic"].lower() for x in topic_wise_tips):
            missed = int(t.get("missed", 0))
            total = int(t.get("total", 0))
            topic_wise_tips.append({
                "topic": name,
                "tips": [
                    clamp_words(f"Revise {name} basics before mixed questions.", 14),
                    clamp_words(f"You missed {missed} of {total}; fix repeat patterns.", 14),
                    clamp_words(f"Do 12 {name} questions in 15 minutes.", 14),
                ],
            })

    # Ensure exactly 3 topic blocks
    while len(topic_wise_tips) < 3:
        topic_wise_tips.append({
            "topic": "General",
            "tips": [
                "Write an error log after practice.",
                "Redo wrong questions after 24 hours.",
            ],
        })

    topic_wise_tips = topic_wise_tips[:3]

    # ---- OVERALL FEEDBACK (must mention timing) ----
    overall_feedback = ensure_string(ai.get("overall_feedback"))
    if not overall_feedback:
        overall_feedback = "You made good progress and can improve with practice. Keep going!"

    # Ensure timing mentioned somewhere in overall_feedback
    if time_taken is not None and ("minute" not in overall_feedback.lower()) and ("time" not in overall_feedback.lower()):
        overall_feedback = f"{overall_feedback} Time taken: {time_taken} minutes."

    cta = ensure_string(ai.get("cta")) or "Pick one weak topic and practice it today."
    encouragement = ensure_string(ai.get("encouragement")) or (
        "You can improve quickly with short daily practice. "
        "Focus on one topic at a time. "
        "Review mistakes and try again. "
        "You are getting better every week."
    )

    return {
        "overall_feedback": overall_feedback,
        "coach": coach_items,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "growth_areas": growth_areas,
        "study_tips": study_tips,
        "topic_wise_tips": topic_wise_tips,  # ✅ NEW SHAPE
        "cta": cta,
        "encouragement": encouragement,
    }


# -------------------------
# Placeholder feedback (first session / no attempts)
# -------------------------
def placeholder_feedback(subject: str, quiz_name: str, model_name: str, year_level: Optional[int]) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    return {
        "success": True,
        "performance_analysis": {
            "year_level": year_level,
            "overall_percentage": 0,
            "accuracy": 0,
            "grade": "",
            "time_taken_minutes": None,
            "total_questions": 0,
            "seconds_per_question": None,
            "pace": "unknown",
            "high_performance_count": 0,
            "low_performance_count": 0,
            "top_topics": [],
            "weak_topics": [],
        },
        "ai_feedback": {
            "overall_feedback": "Complete your first quiz to unlock insights. Timing will appear after attempts.",
            "coach": [
                {
                    "insight": "No completed attempt found yet.",
                    "reason": "We need answers to identify strengths and weaknesses.",
                    "action": "Try a short practice set for 5–10 minutes.",
                }
            ],
            "strengths": [],
            "weaknesses": [],
            "growth_areas": [],
            "study_tips": [
                "Start with a small set of questions",
                "Work in short focused sessions",
                "Review mistakes to learn faster"
            ],
            "topic_wise_tips": [
                {"topic": "Getting Started", "tips": ["Finish one quiz attempt to unlock tips."]}
            ],
            "cta": "Take your first quiz to unlock your AI Coach!",
            "encouragement": "You are ready to start. One small step today is progress.",
        },
        "ai_feedback_meta": {
            "model": model_name,
            "generated_at": now.isoformat(),
            "subject": subject,
            "quiz_name": quiz_name,
            "year_level": year_level,
            "source": "subject_feedback/gemini_subject_feedback.py",  # 👈 CHANGED: was "openai_subject_feedback.py"
            "status": "done",
            "status_message": "Ready - awaiting first quiz attempt"
        },
    }


# -------------------------
# Main
# -------------------------
def main():
    payload_raw = sys.stdin.read()

    try:
        payload = json.loads(payload_raw or "{}")
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON input: {str(e)}"}))
        return

    doc = payload.get("doc") or {}
    quiz_name = doc.get("quiz_name") or doc.get("quizName") or ""

    subject = infer_subject_from_quiz_name(quiz_name)

    if subject == "Writing":
        print(json.dumps({"success": False, "error": "Writing assessments are handled separately"}))
        return

    year_level = infer_year_level(doc, quiz_name)

    student_data, err = normalize_student_data(doc)
    if err:
        print(json.dumps({"success": False, "error": err}))
        return

    try:
        providers = init_providers()
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Failed to initialize providers: {str(e)}"}))
        return

    if not providers:
        print(json.dumps({"success": False, "error": "No AI provider key set (need GEMINI_API_KEY and/or OPENAI_API_KEY)"}))
        return

    # The model we *intend* to use first (for placeholder/meta before any call)
    primary_model = providers[0]["model"]

    if is_no_attempt_session(doc, student_data["sub_subjects"]):
        print(json.dumps(placeholder_feedback(subject, quiz_name, primary_model, year_level)))
        return

    analysis = analyze_performance(student_data, doc, year_level)

    product_insights = [
        "Use topic names and numbers in every point",
        "Be specific and actionable; give time/count targets",
        "Balance encouragement with honest focus areas",
        "Include timing insights when pace is fast/slow",
        "Keep language appropriate for the year level",
        "For topic_wise_tips: topic + 1-3 bullet tips only",
    ]

    # 👈 CHANGED: Reading uses passage-difficulty feedback (no skills/sub-topics).
    is_reading = subject == "Reading"
    if is_reading:
        prompt = build_reading_prompt(analysis, year_level, product_insights)
    else:
        prompt = build_gemini_prompt(analysis, subject, product_insights)

    try:
        feedback_raw, used_model, used_provider = generate_feedback(providers, prompt)
        if is_reading:                                                    # 👈 CHANGED
            feedback = coerce_reading_feedback_schema(feedback_raw, analysis)
        else:
            feedback = coerce_ai_feedback_schema(feedback_raw, analysis, subject)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"AI generation failed: {str(e)}"}))
        return

    now = datetime.now(timezone.utc)

    result = {
        "success": True,
        "performance_analysis": analysis,
        "ai_feedback": feedback,
        "ai_feedback_meta": {
            "model": used_model,
            "provider": used_provider,
            "generated_at": now.isoformat(),
            "subject": subject,
            "quiz_name": quiz_name,
            "year_level": year_level,
            "source": "subject_feedback/gemini_subject_feedback.py",  # 👈 CHANGED: was "openai_subject_feedback.py"
            "status": "done",
            "status_message": f"Feedback generated successfully ({used_provider})"
        },
    }

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()