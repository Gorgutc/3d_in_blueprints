---
name: blueprints-code-rules
description: Use when changing scripts, hooks, validators, or product code inside the selected Blender add-on + backend scope.
---

# Blueprints Code Rules

## Overview

Executable code now includes Codex infrastructure plus accepted product slices
inside the active Blender add-on + local backend scope.

## Rules

Keep scripts small, cross-platform, deterministic, and honest about failures.
Product code needs an explicit iteration scope and matching tests before
implementation.
