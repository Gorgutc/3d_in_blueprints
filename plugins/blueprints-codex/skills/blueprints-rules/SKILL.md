---
name: blueprints-rules
description: Use when changing any file in 3d_in_blueprints or deciding whether a requested change fits the selected Blender add-on + backend scope.
---

# Blueprints Rules

## Overview

Keep work inside the selected Blender add-on + backend scope.

## Rules

- Change implemented product paths and Blender smoke routes only inside the
  current approved capability scope with matching tests. Do not add compilers,
  installers, runtime dependencies, committed generated artifacts, or browser
  gates without explicit activation.
- Keep Node usage limited to Codex infrastructure.
- Treat source repository material as reference, not active policy.
- Run the infrastructure gates before delivery.
