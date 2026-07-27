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

For I8, the approved values are add-on `0.2.1`, backend `0.1.1`, and Node
verification harness/package-lock `0.1.0`; data schemas remain `1.0`. These are
independent component versions, not a lockstep product version. The packager
must continue reading each value from its canonical owner rather than copying
one component's version into another.

## Two-ZIP Installation

1. Install and enable `blueprints_addon-<addon-version>.zip` through Blender
   Preferences.
2. Extract `blueprints_backend-<backend-version>.zip` to a stable local folder.
3. In the add-on preferences, set `Backend Source` to that extraction folder.

The selected Backend Source folder directly contains the
`blueprints_backend` package, including `blueprints_backend/__init__.py` and
`blueprints_backend/__main__.py`. Select the containing folder, not the ZIP and
not the package directory itself:

```text
D:\BlueprintsBackend\              <- Backend Source
└── blueprints_backend\
    ├── __init__.py
    └── __main__.py
```

Blank Backend Source is supported only for trusted discovery from a repository
source checkout. A separately installed add-on cannot infer the separately
installed backend and must fail with actionable `backend_not_configured`
guidance until the user selects the extraction folder.

`Backend Python` is optional. When blank, the add-on uses Blender's
`sys.executable`. `Job Root` is optional; when blank, the add-on creates
temporary job folders.

## Smoke

```bash
npm run test:packaging
```

The smoke command writes artifacts into a temporary directory, verifies required
zip contents, extracts the backend ZIP outside the checkout, clears inherited
`PYTHONPATH`, runs the extracted `blueprints_backend` package, and validates
`drawing_ir.json`, `sheet.svg`, and `diagnostics.json`. It leaves no generated
release artifact in the repository.

`npm run test:blender` separately installs and enables the generated add-on ZIP
under a temporary Blender user directory. It verifies both the actionable
blank-configuration failure and the configured flow against the extracted
backend ZIP.

## Runtime Expectation

Packaging does not implement projection. SceneSnapshot jobs still produce the
`projection_pending` warning; the installed add-on must not report
`Blueprint generated` for that result. `Blueprints SVG Preview` contains raw
SVG source for inspection and is not a rendered preview.

## Defers

Windows executable packaging, installers, code signing, FreeCAD/TechDraw
execution, OCCT/C++ builds, and DXF/PDF/DWG exports remain deferred after I8.
