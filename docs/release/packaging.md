# Release Packaging

I7 packaging is scoped to the active Blender add-on + local backend product
profile. It does not activate the dormant Windows executable profile.

## Artifacts

Run the release packager with an output directory:

```bash
python scripts/package_release.py --output-dir dist
```

The packager writes:

- `blueprints_addon-<addon-version>.zip`
- `blueprints_backend-<backend-version>.zip`
- `release_manifest.json`

The add-on version comes from `blender_addon/blueprints_addon/__init__.py`
`bl_info["version"]`. The backend version comes from
`backend/src/blueprints_backend/__init__.py` `__version__`. The manifest records
the repository package version and commit stamp.

## Smoke

```bash
npm run test:packaging
```

The smoke command writes artifacts into a temporary directory, verifies required
zip contents, and leaves no generated release artifact in the repository.

## Defers

Windows executable packaging, installers, code signing, FreeCAD/TechDraw
execution, OCCT/C++ builds, and DXF/PDF/DWG exports remain out of I7 scope.
