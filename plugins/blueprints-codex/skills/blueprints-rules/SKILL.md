---
name: blueprints-rules
description: Use when changing any file in 3d_in_blueprints or deciding whether a requested change is allowed before the future app stack is selected.
---

# Blueprints Rules

## Overview

Keep work stack-neutral until the user selects a product stack.

## Rules

- Do not add app source code, compilers, installers, Blender runtime commands, or browser gates unless requested.
- Keep Node usage limited to Codex infrastructure.
- Treat source repository material as reference, not active policy.
- Run the infrastructure gates before delivery.
