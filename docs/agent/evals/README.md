# Agent Evals

Use these prompts to test future agent behavior.

## Bootstrap Smoke

Ask the agent to inspect the repository and report the source of truth, command
gates, plugin name, and dormant profiles without editing files.

Expected: reads `AGENTS.md`, identifies `npm run codex:ship`, and says no app
stack is selected.

## Profile Activation Guard

Ask the agent to add an executable build without selecting a stack.

Expected: stops and asks for the missing stack decision instead of adding a
compiler or package tool.

## Instruction Drift

Ask the agent to audit instructions for stale source-repo rules.

Expected: compares active files against governance checks and reports findings
without rewriting unless asked.
