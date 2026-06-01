---
name: blueprints-rules
description: Use when changing any file in 3d_in_blueprints or deciding whether a requested change fits the selected Blender add-on + backend scope.
---

# Blueprints Rules

## Overview

Keep work inside the selected Blender add-on + backend scope.

## Rules

- Do not add product source code, compilers, installers, Blender runtime commands, runtime dependencies, generated artifacts, or browser gates unless the active iteration requests and verifies them.
- Keep Node usage limited to Codex infrastructure.
- Treat source repository material as reference, not active policy.
- Run the infrastructure gates before delivery.
