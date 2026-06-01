---
name: blueprints-session-bootstrap
description: Use when starting substantial 3d_in_blueprints work, resuming context, or preparing to modify instructions, hooks, agents, skills, docs, CI, profiles, or verification.
---

# Blueprints Session Bootstrap

## Overview

Load the current repository contract before acting.

## Workflow

1. Read `AGENTS.md`.
2. Check `git status --short --branch`.
3. Confirm the selected scope remains Blender add-on + local standalone backend unless the current request changes it.
4. For broad work, read `docs/agent/orchestration.md` and spawn applicable agents.
5. Before delivery, run `npm run codex:ship` and `/review` or the fallback review.
