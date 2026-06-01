# Code Review

Use this guide for scripts, hooks, workflow files, skills, and docs.

## Review Order

1. Read the current request and `AGENTS.md`.
2. Inspect the final diff.
3. Check whether any package toolchain, installer, runtime dependency, Blender
   command, or generated product artifact was introduced outside the active
   iteration scope.
4. Review scripts and hooks for syntax, exit codes, recursion, unsafe commands,
   and misleading output.
5. Review skills for trigger clarity and selected-scope consistency.
6. Run `npm run codex:ship`.
7. Run `/review` when available, otherwise perform this checklist as the
   fallback and report it.

## Findings

Lead with blockers first. Include file paths and concrete fixes. Minor defers
are acceptable only when they do not weaken the ship gate.
