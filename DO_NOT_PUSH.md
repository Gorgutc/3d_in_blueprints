# Do Not Push

Do not commit or push:

- `.env*`, secrets, tokens, private keys, credentials, or API dumps.
- local memory artifacts, private notes, scratch files, or personal exports.
- `reports/`, `test-results/`, coverage folders, logs, caches, or temporary
  screenshots unless a future task explicitly asks for committed evidence.
- generated installers, unsigned executables, Blender export zips, build
  outputs, vendored binaries, or generated package artifacts.
- generated backend job outputs such as `drawing_ir.json`, `sheet.svg`,
  `assist_overlay.svg`, and `diagnostics.json` outside committed test fixtures.
- downloaded references from external storage unless the user explicitly asks
  for that export and provenance is documented.

If a required artifact may contain sensitive content, stop and ask before
staging it.
