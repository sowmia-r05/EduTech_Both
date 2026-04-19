def build_prompt(ctx, history_block, chat_history, message):
    turns = ""
    for t in (chat_history or []):
        role = "Child" if t.get("role") == "child" else "AI Tutor"
        turns += f"{role}: {t.get('content','')}\n"

    wrong = "\n".join([
        f"  Q: {q.get('question_text','')}\n  Child answered: {q.get('child_answer','')}\n  Correct: {q.get('correct_answer','')}"
        for q in ctx.get("wrong_questions", [])[:5]
    ]) or "None"

    return f"""You are a friendly NAPLAN tutor for {ctx.get('child_name','Student')}, Year {ctx.get('year_level', 3)}.

=== THIS QUIZ ===
Quiz: {ctx.get('quiz_name','Unknown')}
Score: {ctx.get('score_pct', 0)}%
Wrong questions:
{wrong}

{history_block or ''}

=== RULES ===
- Be helpful, encouraging, and age-appropriate
- Answer only what the child asks
- Keep reply under 120 words

=== CONVERSATION ===
{turns}
Child: {message}
AI Tutor:"""