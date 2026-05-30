# ADR 0002: Dormant Product Profiles

## Status

Accepted.

## Decision

Keep `windows-exe` and `blender-addon` as dormant profiles until a future task
selects one or both.

## Consequences

Infrastructure can mention likely future packaging paths without pulling in
toolchains, dependencies, app source, or build commands prematurely.
