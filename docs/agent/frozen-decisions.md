# Frozen Decisions

These decisions are active until the current user request explicitly changes
them:

- `FD-001` Product scope is selected: Blender add-on + local standalone backend.
- `FD-002` Node tooling is a verification command harness, not the product runtime.
- `FD-003` `blender-addon` profile is active; `windows-exe` profile is dormant.
- `FD-004` Blender baseline is Blender 5.1.
- `FD-005` Backend strategy is Python-first with FreeCAD/TechDraw as the MVP geometry
  provider.
- `FD-006` OCCT/C++ is deferred until profiling proves it is needed.
- `FD-007` Add-on/backend transport is subprocess + job folder.
- `FD-008` Canonical drawing output is SVG. DXF and PDF are derived formats. DWG is not
  core v1.
- `FD-009` GPL-sensitive dependencies are allowed only across a separate
  process/distribution boundary.
- `FD-010` Source repository rules are source material, not active policy.
- `FD-011` Every repo-local skill has `SKILL.md` and `agents/openai.yaml`.
- `FD-012` Every `.codex/agents/*.toml` role returns PASS/FAIL with evidence.
- `FD-013` `npm run codex:ship` is required before delivery.
- `FD-014` Final closeout includes `/review` or an explicitly labeled fallback review.

When changing these decisions, update this file and the matching verification
script in the same change.
