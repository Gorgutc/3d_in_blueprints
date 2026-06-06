bl_info = {
    "name": "3d in Blueprints",
    "author": "Gorgutc",
    "version": (0, 2, 0),
    "blender": (5, 1, 0),
    "location": "View3D > Sidebar > Blueprints",
    "description": "Thin Blender client for the local 3d_in_blueprints backend.",
    "category": "Object",
}

import sys
from pathlib import Path

import bpy

from . import bridge
from . import preview


class BLUEPRINTS_AddonPreferences(bpy.types.AddonPreferences):
    bl_idname = __package__

    backend_python: bpy.props.StringProperty(
        name="Backend Python",
        description="Python executable used to run the local backend",
        subtype="FILE_PATH",
        default="",
    )
    backend_source: bpy.props.StringProperty(
        name="Backend Source",
        description="Path to backend/src for local development",
        subtype="DIR_PATH",
        default="",
    )
    job_root: bpy.props.StringProperty(
        name="Job Root",
        description="Optional folder where bridge job folders are created",
        subtype="DIR_PATH",
        default="",
    )
    export_format: bpy.props.EnumProperty(
        name="Asset Export",
        items=(
            ("OBJ", "OBJ", "Export scene assets as OBJ"),
            ("GLB", "GLB", "Export scene assets as binary glTF"),
        ),
        default="OBJ",
    )
    timeout_seconds: bpy.props.IntProperty(
        name="Backend Timeout",
        description="Backend subprocess timeout in seconds",
        default=30,
        min=1,
        max=600,
    )

    def draw(self, _context):
        layout = self.layout
        layout.prop(self, "backend_python")
        layout.prop(self, "backend_source")
        layout.prop(self, "job_root")
        layout.prop(self, "export_format")
        layout.prop(self, "timeout_seconds")


class BLUEPRINTS_OT_generate(bpy.types.Operator):
    bl_idname = "blueprints.generate"
    bl_label = "Generate Blueprint"
    bl_description = "Export the current scene snapshot and run the local backend"
    bl_options = {"REGISTER"}

    def execute(self, context):
        prefs = addon_preferences(context)
        backend_python = prefs.backend_python or sys.executable
        if prefs.backend_source:
            backend_source = prefs.backend_source
        else:
            repo_root = bridge.find_repo_root(Path(__file__))
            backend_source = str(repo_root / "backend" / "src")
        job_root = prefs.job_root or None

        try:
            result = bridge.run_bridge(
                bpy,
                context,
                backend_python=backend_python,
                backend_src_path=backend_source,
                export_format=prefs.export_format,
                job_root=job_root,
                timeout_seconds=prefs.timeout_seconds,
            )
            preview.load_outputs_into_text_blocks(bpy, result.job_dir)
        except bridge.BridgeError as exc:
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}

        if result.returncode != 0:
            self.report({"ERROR"}, f"Backend failed; diagnostics loaded from {result.job_dir}")
            return {"CANCELLED"}

        self.report({"INFO"}, f"Blueprint generated in {result.job_dir}")
        return {"FINISHED"}


class BLUEPRINTS_PT_panel(bpy.types.Panel):
    bl_idname = "BLUEPRINTS_PT_panel"
    bl_label = "Blueprints"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Blueprints"

    def draw(self, _context):
        self.layout.operator(BLUEPRINTS_OT_generate.bl_idname)


classes = (
    BLUEPRINTS_AddonPreferences,
    BLUEPRINTS_OT_generate,
    BLUEPRINTS_PT_panel,
)


class DefaultBridgePreferences:
    backend_python = ""
    backend_source = ""
    export_format = "OBJ"
    job_root = ""
    timeout_seconds = 30


def addon_preferences(context):
    addon = context.preferences.addons.get(__package__)
    if addon is None:
        return DefaultBridgePreferences()
    return addon.preferences


def register():
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
