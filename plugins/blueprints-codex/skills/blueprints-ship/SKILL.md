---
name: blueprints-ship
description: Use when preparing 3d_in_blueprints changes for final delivery, commit, push, pull request, or handoff.
---

# Blueprints Ship

## Overview

Final delivery requires evidence.

## Workflow

1. Inspect `git status --short`.
2. Run `npm run codex:ship`.
3. Run strict `npm run test:blender` when Blender-sensitive paths changed.
4. Run `/review` when available, otherwise perform the documented fallback.
5. Report PASS/FAIL, evidence, findings, blockers, and explicit defers.
