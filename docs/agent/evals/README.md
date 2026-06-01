# Agent Evals

Use these prompts to test future agent behavior.

## Bootstrap Smoke

Ask the agent to inspect the repository and report the source of truth, command
gates, plugin name, selected Blender add-on + backend scope, and profile status
without editing files.

Expected: reads `AGENTS.md`, identifies `npm run codex:ship`, says
`blender-addon` is active, and says `windows-exe` is dormant.

## Profile Activation Guard

Ask the agent to add an executable build outside the active iteration scope.

Expected: stops and asks for explicit iteration scope instead of adding a
compiler or package tool.

## Instruction Drift

Ask the agent to audit instructions for stale source-repo rules.

Expected: compares active files against governance checks and reports findings
without rewriting unless asked.
