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


def build_prompt(payload):
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

    # Sort by percentage for strong/weak
    sorted_topics = sorted(
        [(name, topic_pct(v)) for name, v in topics.items() if v.get("total", 0) > 0],
        key=lambda x: x[1], reverse=True
    )
    strong_topics = [f"{n} ({p}%)" for n, p in sorted_topics[:3] if p >= 70]
    weak_topics   = [f"{n} ({p}%)" for n, p in sorted_topics[-3:] if p < 65]

    # Score history (last 8 attempts, chronological)
    sorted_tests  = sorted(tests, key=lambda t: parse_date(t.get("date")) or datetime.min)
    recent        = sorted_tests[-8:]
    score_history = ", ".join(f"{t['score']}%" for t in recent)
    quiz_names    = list({t.get("quiz_name", "") for t in recent if t.get("quiz_name")})

    prompt = f"""You are an expert NAPLAN tutor and learning coach for Australian primary school students.
You are generating CUMULATIVE feedback for a Year {year_level} student named {display_name}.

SUBJECT FOCUS: {subject_label}
TOTAL QUIZZES COMPLETED: {total_tests}
AVERAGE SCORE: {avg_score}%
BEST SCORE: {best_score}%
LOWEST SCORE: {worst_score}%
PERFORMANCE TREND: {trend}
RECENT SCORE HISTORY: {score_history}
QUIZZES TAKEN: {', '.join(quiz_names[:5]) or 'Various quizzes'}
"""

    if strong_topics:
        prompt += f"\nSTRONG TOPICS (≥70%): {', '.join(strong_topics)}"
    if weak_topics:
        prompt += f"\nGROWTH TOPICS (<65%): {', '.join(weak_topics)}"

    prompt += f"""

Generate a personalised, cumulative coaching report based on ALL of {display_name}'s performance data above.
This is NOT feedback on a single quiz — it synthesises ALL their quiz history.

Return ONLY valid JSON in this exact format (no markdown, no preamble):
{{
  "summary": "2-3 sentences — open with what they ARE doing well, then build excitement about where they are heading. Never open with a low score or a problem.",
  "strengths": [
    "Something genuine to celebrate — even completing quizzes counts. Reference a specific topic or score.",
    "Another real positive — consistency, a best score, a topic they handled well.",
    "A third strength or effort-based praise, e.g. 'Completed {total_tests} quizzes — that dedication builds real skill.'"
  ],
  "areas_for_improvement": [
    {{"issue": "Frame as an exciting next unlock, e.g. 'Levelling up in X' or 'Building speed in Y' — never say struggling or failing.", "how_to_improve": "One small, specific, doable action they can take today or this week."}},
    {{"issue": "Second growth opportunity — phrased positively.", "how_to_improve": "Practical tip that feels achievable, not overwhelming."}}
  ],
  "study_tips": [
    "Tip phrased as what TO DO — short, specific, actionable for Year {year_level}.",
    "Tip 2 — practical and encouraging.",
    "Tip 3 — can reference a specific topic from their history."
  ],
  "encouragement": "1-2 sentences that feel personal and genuine. Reference their actual effort or a specific number (e.g. quizzes completed, best score). Must leave them feeling capable and excited to try again — not just reassured, but genuinely fired up.",
  "trend": "{trend}",
  "topic_highlights": [
    "Celebrate their best topic with enthusiasm and a specific percentage.",
    "Frame the growth topic as exciting potential: 'X is your next big win — here is why.'"
  ]
}}

TONE RULES — mandatory, not optional:
- You are the most encouraging coach they have ever had — warm, specific, and genuinely excited about their progress
- NEVER use words like: struggling, failing, poor, low, bad, weak, behind, disappointing, needs work
- ALWAYS reframe negatives as opportunities: "building toward", "next unlock", "ready to level up", "great foundation forming"
- Even if the average score is below 40%, lead with effort — completing quizzes IS progress, any topic above 50% IS a strength
- The child and their parent will read this together — it must leave both of them feeling hopeful and motivated
- Be specific — mention actual topic names, quiz counts, or scores so it feels personal, not generic
- Age-appropriate language for Year {year_level} — simple, direct, warm
- "areas_for_improvement" must have EXACTLY 2-3 items
- "strengths" must have EXACTLY 2-3 items
- "study_tips" must have EXACTLY 3 items
- If subject is "Overall", acknowledge every subject they attempted — no subject left unmentioned
- Return ONLY JSON, no explanation, no markdown
"""
    return prompt


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

    prompt = build_prompt(payload)

    try:
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.4,
                max_output_tokens=1200,
            ),
        )
        raw_output = response.text or ""
    except Exception as e:
        print(json.dumps({"success": False, "error": f"AI API error: {e}"}))
        sys.exit(0)

    cleaned = clean_json_output(raw_output)

    try:
        feedback = json.loads(cleaned)
    except json.JSONDecodeError:
        # Fallback: try to extract the last valid JSON block from output
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            try:
                feedback = json.loads(match.group())
            except Exception:
                print(json.dumps({
                    "success": False,
                    "error": "Could not parse AI JSON output",
                    "raw": raw_output[:500],
                }))
                sys.exit(0)
        else:
            print(json.dumps({
                "success": False,
                "error": "AI returned non-JSON output",
                "raw": raw_output[:500],
            }))
            sys.exit(0)

    avg_score = round(sum(t["score"] for t in tests) / len(tests), 1) if tests else 0

    print(json.dumps({
        "success": True,
        "feedback": feedback,
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