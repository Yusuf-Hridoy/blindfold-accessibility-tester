# Blindfold — rules for Claude Code

Blindfold is a free, open-source tool that walks through websites using only a
keyboard and a screen reader, and reports where blind users would get stuck.

## Git (strict)
- Never run git commands that change files in history, the index or branches.
  No add, commit, push, merge, rebase, reset, checkout, switch, tag or stash.
- Read-only git is fine: `git status`, `git diff`, `git log`.
- The owner reviews and commits everything himself.

## How to finish every task
End every task with a short report containing:
1. Files created or changed (one line each, saying what the file is for)
2. Test results (`npm test` output summary)
3. What the owner should check by hand, step by step
4. A suggested commit message (conventional commits style, e.g. `feat: ...`)

## Code style
- TypeScript with `strict: true`.
- File names must say what the file does, e.g. `keyboard-pass-walker.ts`,
  never `utils.ts`, `helpers.ts` or `index2.ts`.
- Keep the design simple and industry-standard. No clever abstractions,
  no frameworks unless the brief asks for one.
- Small functions, clear names, comments only where the "why" isn't obvious.

## Budget and data
- $0 budget: no paid services, no AI or LLM APIs, no telemetry, no tracking.
- All demo content is fictional: the shop is "Pebble & Pine".
  Never add real company, employer or product names.

## Quality
- All tests must pass before reporting a task as done.
- If something in the brief is impossible or unclear, stop and explain
  instead of guessing or quietly changing scope.
