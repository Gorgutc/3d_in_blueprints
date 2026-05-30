---
name: blueprints-frozen-decisions
description: Use when changing frozen decisions, dormant profile status, command gates, authority order, or the no-app-stack-yet contract.
---

# Blueprints Frozen Decisions

## Overview

Protect decisions recorded in `docs/agent/frozen-decisions.md`.

## Workflow

If a decision changes, update the frozen decision doc and matching validation in
the same change. Without explicit user approval, treat drift as FAIL.
