# Codex Bootstrap

1. Read `AGENTS.md`.
2. Check `git status --short --branch`.
3. Confirm that no application stack is selected yet unless the current request
   explicitly selects one.
4. For broad work, read `docs/agent/orchestration.md` and spawn applicable
   read-only subagents when available.
5. Use repo-local skills from `plugins/blueprints-codex/skills/`.
6. Before delivery, run `npm run codex:ship`.
7. Run `/review` when available. If it is unavailable, perform the requirements
   and diff review fallback and label it clearly.
