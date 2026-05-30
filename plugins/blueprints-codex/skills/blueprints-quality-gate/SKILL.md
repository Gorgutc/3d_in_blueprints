---
name: blueprints-quality-gate
description: Use when reviewing final 3d_in_blueprints changes for bugs, drift, unsafe automation, missing verification, unclear docs, or profile boundary violations.
---

# Blueprints Quality Gate

## Overview

Review the final diff before delivery.

## Output

Return PASS/FAIL with evidence, blockers, and explicit defers. Run or review
`npm run codex:ship`. Block delivery on failing verification, unsafe hooks, or
unapproved stack activation.
