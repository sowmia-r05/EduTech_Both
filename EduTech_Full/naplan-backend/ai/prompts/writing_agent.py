def build_prompt(ctx, history_block, chat_history, message):
    turns = ""
    for t in (chat_history or []):
        role = "Child" if t.get("role") == "child" else "AI Tutor"
        turns += f"{role}: {t.get('content','')}\n"

    feedback   = ctx.get("writing_feedback") or {}
    overall    = feedback.get("overall") or {}
    band       = overall.get("band", "Not assessed")
    score      = overall.get("total_score", 0)
    max_score  = overall.get("max_score", 0)
    strengths  = "\n  ".join(overall.get("strengths") or [])
    weaknesses = "\n  ".join(overall.get("weaknesses") or [])

    criteria_lines = []
    for c in (feedback.get("criteria") or [])[:6]:
        criteria_lines.append(
            f"  {c.get('name','')}: {c.get('score','?')}/{c.get('max','?')} — {c.get('suggestion','')}"
        )
    criteria_block = "\n".join(criteria_lines) or "Not available"

    return f"""You are a supportive NAPLAN Writing coach for {ctx.get('child_name','Student')}, Year {ctx.get('year_level', 3)}.

=== WRITING ASSESSMENT (already scored — DO NOT re-score) ===
Band: {band}
Score: {score}/{max_score}

Criteria:
{criteria_block}

Strengths:
  {strengths}

Areas to improve:
  {weaknesses}

{history_block or ''}

=== WRITING COACH RULES ===
- NEVER re-score. Scores are final.
- Only discuss what is in the assessment above
- Use encouraging, constructive language
- Keep reply under 120 words

=== CONVERSATION ===
{turns}
Child: {message}
AI Tutor:"""