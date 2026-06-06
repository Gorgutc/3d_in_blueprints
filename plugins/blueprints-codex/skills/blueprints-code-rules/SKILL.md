---
name: blueprints-code-rules
description: Use when changing scripts, hooks, validators, or product code inside the selected Blender add-on + backend scope.
---

# Blueprints Code Rules

## Overview

Executable code now includes Codex infrastructure and the active I1 backend
CLI/DrawingIR slice.

## Rules

Keep scripts small, cross-platform, deterministic, and honest about failures.
Product code needs an explicit iteration scope and matching tests before
implementation.
