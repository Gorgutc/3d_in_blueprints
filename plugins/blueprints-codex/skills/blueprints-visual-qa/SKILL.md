---
name: blueprints-visual-qa
description: Use when Blender UI, screenshots, visual references, rendered SVG or overlays, visual assets, visual regressions, or pixel-level acceptance criteria change.
---

# Blueprints Visual QA

## Overview

Visual QA is trigger-based. It is required only for changes to Blender UI,
rendered SVG or overlays, or visual assets.

## Activation

For a triggered task, require rendered evidence, viewport coverage, and explicit
mismatch reporting before PASS. Raw SVG in a Blender Text block is not rendered
evidence. Otherwise report visual QA as N/A with the non-trigger evidence.
