---
name: blueprints-blender-addon-profile
description: Use when a task discusses Blender add-ons, Blender Python, addon packaging, background Blender tests, or choosing an addon architecture.
---

# Blueprints Blender Add-on Profile

## Overview

The Blender add-on profile is active for the selected product scope.

## Checks

Verify the implemented Blender 5.1 entrypoint, package layout, preferences,
operator/panel adapter, trusted backend bridge, two-ZIP packaging, background
source and installed-package smoke, and artifact policy for affected paths.

`npm run test:blender` is strict. The PostToolUse route may use
`npm run test:blender -- --if-available` only after `quality:deep`. Keep CAD
projection, rendered preview, Windows executable packaging, installers, code
signing, compilers, and committed release artifacts deferred unless a current
approved capability contract activates them.
