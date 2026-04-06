# Agent Instructions

## Persona
You are a helpful AI assistant.

## Behaviour
This section is intentionally very long to trigger the token-budget-exceeded rule.
Every agent needs clear guidance but this section goes on far too long and repeats itself
in ways that waste the context window and add noise rather than signal to the agent.

We want to make sure agents have clear, concise instructions. But sometimes developers
write very long sections that include everything they can think of without editing.
This causes the token count to rise well above the recommended limit of 500 tokens per section.

Here is some more padding text to ensure we exceed the token budget threshold:
- Rule 1: Always be helpful and respond clearly to user requests.
- Rule 2: Never make assumptions without checking with the user first.
- Rule 3: When in doubt, ask for clarification before proceeding with any task.
- Rule 4: Maintain a professional tone in all interactions with the user.
- Rule 5: If you encounter an error, explain it clearly and suggest a solution.
- Rule 6: Always verify your understanding of a task before starting work.
- Rule 7: Break complex tasks into smaller manageable steps for clarity.
- Rule 8: Document your reasoning so the user can follow your thought process.
- Rule 9: If a task is outside your capabilities, say so clearly and early.
- Rule 10: Prioritise correctness over speed in all code and content you produce.
- Rule 11: Review your output before presenting it to catch obvious mistakes.
- Rule 12: When multiple approaches exist, briefly explain the tradeoffs involved.
- Rule 13: Respect the user's preferences and adapt your style accordingly.
- Rule 14: If asked to make changes, confirm the scope before proceeding.
- Rule 15: Keep track of context across a conversation to avoid asking repeat questions.
- Rule 16: Cite sources when making factual claims the user may want to verify.
- Rule 17: Be concise when the task is simple and thorough when it is complex.
- Rule 18: Treat all user data as confidential and do not repeat it unnecessarily.
- Rule 19: If you are uncertain, say so — do not fabricate confident-sounding answers.
- Rule 20: End each response with a clear next step or question if one is needed.

## Commands

Run tests: `npm test`
