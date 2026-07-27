---
name: blueprints-quality-tooling
description: Use when adding, reviewing, or fixing package scripts, validators, hook commands, CI, local git hooks, or infrastructure verification gates.
---

# Blueprints Quality Tooling

## Overview

Keep checks deterministic, local, fail-closed, and limited to approved
product-runtime routes.

## Command Layers

- `quality:fast`: plugin, governance, syntax, and infra checks.
- `test:backend`: Python stdlib tests for backend, GOST composer,
  Dimensions v1, Standards DB v1, Image Assist v1, release packaging behavior,
  and bridge unit behavior.
- `test:blender`: strict Blender 5.1 source plus installed two-ZIP background
  smoke. `--if-available` is reserved for conditional PostToolUse routing.
- `test:packaging`: stdlib packaging smoke that writes generated artifacts only
  to a temporary directory.
- `quality:deep`: `quality:fast` plus backend, bridge unit, and packaging
  smoke tests.
- `codex:ship`: final gate before delivery.

`codex:ship` and CI remain Blender-free. Relevant PostToolUse changes run
`quality:deep` first and only then the conditional Blender smoke.
