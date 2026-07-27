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
6. Require visual evidence only when Blender UI, rendered SVG or overlays, or
   visual assets changed; otherwise record visual review as N/A.
7. Run `npm run codex:ship`, plus strict `npm run test:blender` for
   Blender-sensitive paths.
8. Run `/review` when available, otherwise perform this checklist as the
   fallback and report it.

## Findings

Return PASS/FAIL with evidence, findings, blockers, and explicit defers. Lead
with blockers first and include file paths and concrete fixes. Minor defers are
acceptable only when they do not weaken the ship gate.
