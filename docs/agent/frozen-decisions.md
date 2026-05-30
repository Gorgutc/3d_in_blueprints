# Frozen Decisions

These decisions are active until the current user request explicitly changes
them:

- No application stack is selected yet.
- Node tooling is for Codex infrastructure only.
- `windows-exe` and `blender-addon` profiles are dormant.
- Source repository rules are source material, not active policy.
- Every repo-local skill has `SKILL.md` and `agents/openai.yaml`.
- Every `.codex/agents/*.toml` role returns PASS/FAIL with evidence.
- `npm run codex:ship` is required before delivery.
- Final closeout includes `/review` or an explicitly labeled fallback review.

When changing these decisions, update this file and the matching verification
script in the same change.
