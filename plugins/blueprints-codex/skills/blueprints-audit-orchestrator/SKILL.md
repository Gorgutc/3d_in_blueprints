---
name: blueprints-audit-orchestrator
description: Use when broad audits, instruction rewrites, hook changes, skill changes, profile planning, CI changes, or quality-tooling reviews need separated roles.
---

# Blueprints Audit Orchestrator

## Overview

Use explicit spawned subagents for independent review streams.

## Workflow

1. Record the routing decision from `docs/agent/orchestration.md`.
2. Spawn applicable read-only roles from `.codex/agents/`.
3. Require PASS/FAIL, evidence, blockers, and explicit defers.
4. Do not deliver while a required role has unresolved blockers.
