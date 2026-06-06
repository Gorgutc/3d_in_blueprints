---
name: blueprints-quality-tooling
description: Use when adding, reviewing, or fixing package scripts, validators, hook commands, CI, local git hooks, or infrastructure verification gates.
---

# Blueprints Quality Tooling

## Overview

Keep checks deterministic, local, and free of unapproved product-runtime
commands.

## Command Layers

- `quality:fast`: plugin, governance, syntax, and infra checks.
- `test:backend`: Python stdlib tests for backend, GOST composer,
  Dimensions v1, Standards DB v1, Image Assist v1, release packaging behavior,
  and bridge unit behavior.
- `test:blender`: explicit Blender 5.1 background smoke for I2 bridge changes.
- `test:packaging`: stdlib packaging smoke that writes generated artifacts only
  to a temporary directory.
- `quality:deep`: `quality:fast` plus backend, bridge unit, and packaging
  smoke tests.
- `codex:ship`: final gate before delivery.
