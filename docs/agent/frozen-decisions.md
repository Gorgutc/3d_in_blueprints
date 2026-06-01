# Frozen Decisions

These decisions are active until the current user request explicitly changes
them:

- Product scope is selected: Blender add-on + local standalone backend.
- Node tooling is for Codex infrastructure only.
- `blender-addon` profile is active; `windows-exe` profile is dormant.
- Blender baseline is Blender 5.1.
- Backend strategy is Python-first with FreeCAD/TechDraw as the MVP geometry
  provider.
- OCCT/C++ is deferred until profiling proves it is needed.
- Add-on/backend transport is subprocess + job folder.
- Canonical drawing output is SVG. DXF and PDF are derived formats. DWG is not
  core v1.
- GPL-sensitive dependencies are allowed only across a separate
  process/distribution boundary.
- Source repository rules are source material, not active policy.
- Every repo-local skill has `SKILL.md` and `agents/openai.yaml`.
- Every `.codex/agents/*.toml` role returns PASS/FAIL with evidence.
- `npm run codex:ship` is required before delivery.
- Final closeout includes `/review` or an explicitly labeled fallback review.

When changing these decisions, update this file and the matching verification
script in the same change.
