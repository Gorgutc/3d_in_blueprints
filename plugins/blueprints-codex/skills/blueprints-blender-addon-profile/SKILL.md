---
name: blueprints-blender-addon-profile
description: Use when a task discusses Blender add-ons, Blender Python, addon packaging, background Blender tests, or choosing an addon architecture.
---

# Blueprints Blender Add-on Profile

## Overview

The Blender add-on profile is active for the selected product scope.

## Checks

Before product add-on code lands, require Blender version support, addon
entrypoint, package layout, background test command, artifact policy, backend
bridge contract, and iteration-scoped user approval.

For I7 packaging work, allow add-on zip and backend bundle smoke only inside the
active Blender add-on + backend scope. Do not activate Windows executable
packaging, installers, code signing, compilers, or generated committed release
artifacts without an explicit future iteration.
