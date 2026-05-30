---
name: blueprints-quality-tooling
description: Use when adding, reviewing, or fixing package scripts, validators, hook commands, CI, local git hooks, or infrastructure verification gates.
---

# Blueprints Quality Tooling

## Overview

Keep checks deterministic, local, and stack-neutral.

## Command Layers

- `quality:fast`: plugin, governance, syntax, and infra checks.
- `quality:deep`: reserved for future heavier checks.
- `codex:ship`: final gate before delivery.
