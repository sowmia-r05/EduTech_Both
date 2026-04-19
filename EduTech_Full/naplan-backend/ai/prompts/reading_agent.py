def build_prompt(ctx, history_block, chat_history, message):
    turns = ""
    for t in (chat_history or []):
        role = "Child" if t.get("role") == "child" else "AI Tutor"
        turns += f"{role}: {t.get('content','')}\n"

    passage = ctx.get("passage_text") or "Passage not available."

    wrong = "\n".join([
        f"  Q: {q.get('question_text','')}\n  Child answered: {q.get('child_answer','')}\n  Correct: {q.get('correct_answer','')}"
        for q in ctx.get("wrong_questions", [])[:5]
    ]) or "None"

    return f"""You are a friendly NAPLAN Reading tutor for {ctx.get('child_name','Student')}, Year {ctx.get('year_level', 3)}.

=== READING PASSAGE ===
{passage}

=== THIS QUIZ ===
Score: {ctx.get('score_pct', 0)}%
Wrong questions:
{wrong}

{history_block or ''}

=== STRICT READING RULES ===
- You may ONLY discuss what is written in the passage above
- NEVER invent facts not present in the passage
- Always cite: "In paragraph 2..." or "The passage says..."
- Keep reply under 120 words

=== CONVERSATION ===
{turns}
Child: {message}
AI Tutor:"""