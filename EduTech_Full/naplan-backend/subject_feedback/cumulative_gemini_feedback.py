#!/usr/bin/env python3
"""
cumulative_gemini_feedback.py

Reads a JSON payload from stdin, calls Gemini to generate
CUMULATIVE AI coaching feedback across multiple quiz attempts,
then prints a JSON result to stdout.

Payload (stdin):
{
  "child_id": "...",
  "display_name": "Alex",
  "year_level": 5,
  "subject": "Overall",          // "Overall" | "Reading" | "Writing" | "Numeracy" | "Language"
  "tests": [
    {
      "quiz_name": "Numeracy Test 1",
      "score": 72,
      "date": "2024-11-01T10:00:00Z",
      "duration_sec": 1200,
      "topic_breakdown": {
        "Number & Algebra": { "scored": 8, "total": 10 },
        "Measurement": { "scored": 4, "total": 8 }
      }
    }
  ]
}

Output (stdout):
{
  "success": true,
  "feedback": {
    "summary": "...",
    "strengths": ["..."],
    "areas_for_improvement": [
      { "issue": "...", "how_to_improve": "..." }
    ],
    "study_tips": ["..."],
    "encouragement": "...",
    "trend": "improving",
    "topic_highlights": ["..."]
  },
  "meta": {
    "model": "gemini-2.0-flash",
    "attempt_count": 5,
    "average_score": 74.2
  }
}
"""

import sys
import json
import os
import re
from datetime import datetime

# ─────────────────────────────────────────────
# Gemini SDK
# ─────────────────────────────────────────────
try:
    import google.generativeai as genai
except ImportError:
    print(json.dumps({
        "success": False,
        "error": "google-generativeai not installed. Run: pip install google-generativeai"
    }))
    sys.exit(1)


SUBJECT_LABELS = {
    "Overall": "all NAPLAN subjects (Reading, Writing, Numeracy, Language)",
    "Reading": "Reading comprehension",
    "Writing": "Writing",
    "Numeracy": "Numeracy (Mathematics)",
    "Language": "Language Conventions (Grammar, Spelling, Punctuation)",
}


def parse_date(date_str):
    """Parse ISO date string → datetime, return None on failure."""
    if not date_str:
        return None
    try:
        return datetime.fromisoformat(str(date_str).replace("Z", "+00:00"))
    except Exception:
        return None


def compute_trend(tests):
    """
    Determine score trend from chronological list of tests.
    Splits tests in half and compares averages.
    Returns: "improving" | "declining" | "stable" | "new"
    """
    if len(tests) < 2:
        return "new"
    sorted_tests = sorted(tests, key=lambda t: parse_date(t.get("date")) or datetime.min)
    half = max(1, len(sorted_tests) // 2)
    first_avg = sum(t["score"] for t in sorted_tests[:half]) / half
    second_avg = sum(t["score"] for t in sorted_tests[half:]) / (len(sorted_tests) - half)
    diff = second_avg - first_avg
    if diff >= 5:
        return "improving"
    if diff <= -5:
        return "declining"
    return "stable"


def aggregate_topics(tests):
    """Aggregate topic_breakdown across all tests into {topic: {scored, total}}."""
    aggregated = {}
    for t in tests:
        breakdown = t.get("topic_breakdown") or {}
        for topic, vals in breakdown.items():
            if topic not in aggregated:
                aggregated[topic] = {"scored": 0, "total": 0}
            aggregated[topic]["scored"] += vals.get("scored", 0)
            aggregated[topic]["total"] += vals.get("total", 0)
    return aggregated


def topic_pct(vals):
    if not vals.get("total"):
        return 0
    return round(vals["scored"] / vals["total"] * 100)


def build_prompt(payload, tone="parent"):
    display_name = payload.get("display_name") or "the student"
    year_level = payload.get("year_level") or "unknown"
    subject = payload.get("subject") or "Overall"
    tests = payload.get("tests") or []

    subject_label = SUBJECT_LABELS.get(subject, subject)
    total_tests = len(tests)
    avg_score = round(sum(t["score"] for t in tests) / total_tests, 1) if tests else 0
    best_score = max((t["score"] for t in tests), default=0)
    worst_score = min((t["score"] for t in tests), default=0)
    trend = compute_trend(tests)
    topics = aggregate_topics(tests)

    sorted_topics = sorted(
        [(name, topic_pct(v)) for name, v in topics.items() if v.get("total", 0) > 0],
        key=lambda x: x[1], reverse=True
    )
    strong_topics = [f"{n} ({p}%)" for n, p in sorted_topics[:3] if p >= 70]
    weak_topics   = [f"{n} ({p}%)" for n, p in sorted_topics[-3:] if p < 65]

    sorted_tests  = sorted(tests, key=lambda t: parse_date(t.get("date")) or datetime.min)
    recent        = sorted_tests[-8:]
    score_history = ", ".join(f"{t['score']}%" for t in recent)
    quiz_names    = list({t.get("quiz_name", "") for t in recent if t.get("quiz_name")})

    first_score = sorted_tests[0]["score"] if sorted_tests else 0
    last_score  = sorted_tests[-1]["score"] if sorted_tests else 0
    score_delta = last_score - first_score

    quiz_detail_lines = []
    for t in recent[-5:]:
        name  = t.get("quiz_name", "Quiz")
        score = t.get("score", 0)
        date  = (t.get("date") or "")[:10]
        quiz_detail_lines.append(f"  - {name}: {score}% on {date}")
    quiz_detail = "\n".join(quiz_detail_lines) or "  - No detail available"

    # ── tone-specific audience block ──
    if tone == "child":
        audience_block = f"""AUDIENCE: The child ({display_name}) is reading this directly.
TONE: Warm, exciting, fun, direct second-person — always use "you" and "your".
NEVER use {display_name}'s name in third person — talk TO them, not ABOUT them.
Use simple Year {year_level} language. Make it feel like their favourite coach is cheering them on.
Use energy words like "amazing", "you're crushing it", "level up", "you've got this", "keep going"."""
    else:
        audience_block = f"""AUDIENCE: The parent of {display_name} is reading this.
TONE: Professional, warm, informative — use third-person about the child.
Use "{display_name}" or "your child" throughout — never "you" referring to the child.
Focus on what the parent can observe and support at home.
Be encouraging but grounded — parents want honest, actionable insight."""

    data_block = f"""
STUDENT DATA:
SUBJECT FOCUS: {subject_label}
TOTAL QUIZZES COMPLETED: {total_tests}
AVERAGE SCORE: {avg_score}%
BEST SCORE: {best_score}%
LOWEST SCORE: {worst_score}%
PERFORMANCE TREND: {trend}
SCORE JOURNEY: {first_score}% → {last_score}% (change: {score_delta:+d}%)
RECENT SCORE HISTORY: {score_history}
QUIZZES TAKEN: {', '.join(quiz_names[:5]) or 'Various quizzes'}
RECENT QUIZ BREAKDOWN:
{quiz_detail}"""

    if strong_topics:
        data_block += f"\nSTRONG TOPICS (≥70%): {', '.join(strong_topics)}"
    if weak_topics:
        data_block += f"\nGROWTH TOPICS (<65%): {', '.join(weak_topics)}"

    json_shape = f"""
Return ONLY valid JSON (no markdown, no preamble):
{{
  "summary": "2-3 sentences — open with what they ARE doing well, then build excitement about where they are heading.",
  "strengths": [
    "A genuine strength using their actual topic name or score — not generic.",
    "Another real positive from their data.",
    "Effort-based praise referencing {total_tests} quizzes completed."
  ],
  "areas_for_improvement": [
    {{"issue": "Name a specific topic from their actual data that has room to grow — use the real topic name.", "how_to_improve": "One concrete action tied to their quiz history."}},
    {{"issue": "A second specific growth area — different topic, different angle.", "how_to_improve": "A practical, achievable tip different from the first."}}
  ],
  "study_tips": [
    "Short, specific, actionable tip for Year {year_level} — references their actual data.",
    "A second different tip — practical and encouraging.",
    "A third tip referencing a specific topic from their history."
  ],
  "encouragement": "1-2 sentences that feel personal. Reference a specific number (quizzes completed, best score, score improvement). Must feel genuine and fired up.",
  "trend": "{trend}",
  "topic_highlights": [
    "Name their actual strongest topic and its exact percentage — make it feel like a win.",
    "Name their actual weakest topic and its score — frame it as their biggest opportunity."
  ]
}}

RULES:
- NEVER use words: struggling, failing, poor, low, bad, weak, behind, disappointing
- ALWAYS reframe negatives as opportunities
- Be specific — use real topic names, quiz counts, actual scores from the data above
- "areas_for_improvement" must have EXACTLY 2-3 items
- "strengths" must have EXACTLY 3 items
- "study_tips" must have EXACTLY 3 items
- If subject is "Overall", acknowledge every subject attempted
- Return ONLY JSON, no explanation, no markdown
"""

    return f"""You are an expert NAPLAN tutor and learning coach for Australian primary school students.
You are generating CUMULATIVE feedback for a Year {year_level} student named {display_name}.

{audience_block}
{data_block}

Generate a personalised cumulative coaching report based on ALL the data above.
This synthesises ALL their quiz history — not a single quiz.
{json_shape}"""


def clean_json_output(text):
    """Strip markdown fences from AI output."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def main():
    raw = sys.stdin.read()

    try:
        payload = json.loads(raw or "{}")
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON: {e}"}))
        sys.exit(0)

    tests   = payload.get("tests") or []
    subject = payload.get("subject") or "Overall"

    if not tests:
        # Return a friendly empty state — don't error
        print(json.dumps({
            "success": True,
            "feedback": {
                "summary": "No quiz data yet! Take some tests to unlock your personalised AI coaching report.",
                "strengths": [],
                "areas_for_improvement": [],
                "study_tips": [
                    "Start with a subject you feel confident in.",
                    "Try at least one quiz per subject.",
                    "Review your answers after each quiz.",
                ],
                "encouragement": "Every expert was once a beginner. Take your first quiz and let the learning begin!",
                "trend": "new",
                "topic_highlights": [],
            },
            "meta": {"model": "none", "attempt_count": 0, "average_score": 0},
        }))
        return

    api_key    = (os.getenv("GEMINI_API_KEY") or "").strip()
    model_name = (os.getenv("GEMINI_MODEL") or "gemini-2.0-flash").strip()

    if not api_key:
        print(json.dumps({"success": False, "error": "GEMINI_API_KEY not set"}))
        sys.exit(0)

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(model_name)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"AI init failed: {e}"}))
        sys.exit(0)

    prompt_parent = build_prompt(payload, tone="parent")
    prompt_child  = build_prompt(payload, tone="child")

    def call_gemini(prompt):
        resp = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.85,
                max_output_tokens=1500,
            ),
        )
        return resp.text or ""

    def parse_feedback(raw_output):
        cleaned = clean_json_output(raw_output)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", cleaned, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group())
                except Exception:
                    return None
        return None

    try:
        raw_parent = call_gemini(prompt_parent)
        raw_child  = call_gemini(prompt_child)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"AI API error: {e}"}))
        sys.exit(0)

    feedback_parent = parse_feedback(raw_parent)
    feedback_child  = parse_feedback(raw_child)

    if not feedback_parent or not feedback_child:
        print(json.dumps({
            "success": False,
            "error": "Could not parse AI JSON output",
            "raw_parent": raw_parent[:300],
            "raw_child":  raw_child[:300],
        }))
        sys.exit(0)

    avg_score = round(sum(t["score"] for t in tests) / len(tests), 1) if tests else 0

    print(json.dumps({
        "success": True,
        "feedback":       feedback_parent,   # ← parent sees this
        "feedback_child": feedback_child,    # ← child sees this
        "meta": {
            "model": model_name,
            "attempt_count": len(tests),
            "average_score": avg_score,
            "subject": subject,
            "generated_at": datetime.utcnow().isoformat() + "Z",
        },
    }))


if __name__ == "__main__":
    main()