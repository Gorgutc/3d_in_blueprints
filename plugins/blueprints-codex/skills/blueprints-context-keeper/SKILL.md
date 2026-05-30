---
name: blueprints-context-keeper
description: Use when a 3d_in_blueprints task needs a small read-only slice of repo state before implementation or review.
---

# Blueprints Context Keeper

## Overview

Return only the context needed for the current decision.

## Workflow

Use `rg`, `rg --files`, `Get-Content`, and `git status` to inspect narrow paths.
Do not edit files. Report the files inspected and the relevant findings.
