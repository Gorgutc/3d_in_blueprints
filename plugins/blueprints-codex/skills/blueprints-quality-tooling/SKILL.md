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
  Dimensions v1, and bridge unit behavior.
- `test:blender`: explicit Blender 5.1 background smoke for I2 bridge changes.
- `quality:deep`: `quality:fast` plus backend and bridge unit tests.
- `codex:ship`: final gate before delivery.
