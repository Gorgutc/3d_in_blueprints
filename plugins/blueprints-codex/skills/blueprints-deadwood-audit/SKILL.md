---
name: blueprints-deadwood-audit
description: Use when checking 3d_in_blueprints for unused, duplicated, oversized, premature, or unsafe-to-keep infrastructure files.
---

# Blueprints Deadwood Audit

## Overview

Audit only unless assigned a write zone.

## Output

Return keep, fix, remove, archive, and needs-user-decision sections. Do not mark
dormant profiles as deadwood merely because they are inactive.
