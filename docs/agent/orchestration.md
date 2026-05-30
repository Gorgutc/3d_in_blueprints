# Agent Orchestration

Use orchestration when independent review streams can lower risk. Simple edits
can stay local, but broad instruction, hook, skill, quality, profile, or CI work
should use explicit spawned subagents when available.

## Routing Decision

Record this before spawning agents:

```text
Documentation: <docs checked>
Selected skills: <repo skills>
Selected agents: <.codex/agents roles>
Write zone: <read-only or exact paths>
Verification: <commands or evidence>
Reason: <why the route lowers risk>
```

## Prompt Contract

Each delegated prompt must include goal, success criteria, selected docs,
selected skills, selected agents, ownership or write zone, verification, stop
rules, and expected output.

Each result must include PASS/FAIL, evidence, findings or blockers, and explicit
defers. Defers cannot override blockers.

## Standard Roles

- `codex_infra_architect`
- `instruction_drift_auditor`
- `tech_stack_cartographer`
- `quality_tooling_architect`
- `verification_reviewer`
- `code_quality_guardian`
- `code_deadwood_auditor`
- `component_reuse_guardian`
- `runtime_behavior_mapper`
- `frozen_decisions_guardian`
- `visual_qa_guardian`
- `windows_packaging_guardian`
- `blender_addon_guardian`

If spawned agents are unavailable, run equivalent local reviews and report the
fallback.
