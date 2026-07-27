---
name: blueprints-assets
description: Use when a task changes images, models, Blender assets, generated artifacts, installer assets, icons, screenshots, or media provenance.
---

# Blueprints Assets

## Overview

Use this skill only when the task touches visual or generated assets. Backend
job outputs, release ZIPs, and Blender screenshots remain temporary or ignored
unless the current request explicitly approves a committed fixture.

## Rules

Track provenance, avoid committing generated exports by default, and respect
`DO_NOT_PUSH.md` for installers, screenshots, reports, and Blender exports.
