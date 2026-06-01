# ADR 0002: Dormant Product Profiles

## Status

Superseded by ADR 0003 for `blender-addon`. Accepted for `windows-exe`.

## Decision

Keep `windows-exe` dormant until packaging work explicitly activates it.
`blender-addon` was dormant under this decision, then activated by ADR 0003.

## Consequences

Infrastructure can mention Windows packaging paths without pulling in toolchains,
dependencies, app source, or build commands prematurely.
