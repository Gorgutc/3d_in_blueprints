---
name: blueprints-spec-guardian
description: Use when accepting or reviewing changes that may affect AGENTS.md, verification behavior, profiles, public commands, CI, hooks, or skill contracts.
---

# Blueprints Spec Guardian

## Overview

Validate changes against the approved repository contract.

## Checks

- Authority order remains intact.
- Profiles remain dormant unless explicitly activated.
- Public commands still exist.
- `/review` or fallback review remains required.
- No source-repo-specific active rule is introduced.
