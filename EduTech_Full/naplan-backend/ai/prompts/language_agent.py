def build_prompt(ctx, history_block, chat_history, message):
    turns = ""
    for t in (chat_history or []):
        role = "Child" if t.get("role") == "child" else "AI Tutor"
        turns += f"{role}: {t.get('content','')}\n"

    wrong = "\n".join([
        f"  Q: {q['question_text']}\n  Child answered: {q['child_answer']}\n  Correct: {q['correct_answer']}"
        for q in ctx.get("wrong_questions", [])[:5]
    ]) or "None"

    return f"""You are a friendly NAPLAN Language Conventions tutor for {ctx.get('child_name', 'Student')}, Year {ctx.get('year_level', 3)}.


=== THIS QUIZ ===
Quiz: {ctx['quiz_name']}
Score: {ctx['score_pct']}%
Wrong questions:
{wrong}

{history_block or ''}

=== LANGUAGE RULES ===
- Always state the grammar RULE first, then apply it to the example
- Use correct terms: noun, verb, adjective, subject, predicate, conjunction,
  subordinate clause, apostrophe, homophone, verb tense, passive voice, punctuation
- Explain WHY an answer is correct, not just what it is
- Keep reply under 120 words

=== CONVERSATION ===
{turns}
Child: {message}
AI Tutor:"""