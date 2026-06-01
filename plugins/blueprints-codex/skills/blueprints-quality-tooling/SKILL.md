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
- `quality:deep`: reserved for future heavier product checks.
- `codex:ship`: final gate before delivery.
