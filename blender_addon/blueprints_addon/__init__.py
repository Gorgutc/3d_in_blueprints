bl_info = {
    "name": "3d in Blueprints",
    "author": "Gorgutc",
    "version": (0, 2, 1),
    "blender": (5, 1, 0),
    "location": "View3D > Sidebar > Blueprints",
    "description": "Thin Blender client for the local 3d_in_blueprints backend.",
    "category": "Object",
}

import sys

import bpy

from . import bridge
from . import operator_flow
from . import preview


class BLUEPRINTS_AddonPreferences(bpy.types.AddonPreferences):
    bl_idname = __package__

    backend_python: bpy.props.StringProperty(
        name="Backend Python",
        description="Python executable used to run the local backend; blank uses Blender Python",
        subtype="FILE_PATH",
        default="",
    )
    backend_source: bpy.props.StringProperty(
        name="Backend Source",
        description="Folder containing blueprints_backend, such as backend/src or an extracted backend ZIP",
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
        outcome = operator_flow.run_operator_flow(
            clear_preview=lambda: preview.clear_output_text_blocks(bpy),
            get_preferences=lambda: addon_preferences(context),
            resolve_backend=resolve_operator_backend,
            run_bridge=lambda preferences, backend_source: run_operator_bridge(
                context,
                preferences,
                backend_source,
            ),
            load_preview=lambda approved_outputs: preview.load_outputs_into_text_blocks(
                bpy,
                approved_outputs,
            ),
            bridge_error_type=bridge.BridgeError,
        )
        self.report({outcome.report_level}, outcome.report_message)
        return {outcome.status}


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


def resolve_operator_backend(preferences):
    return bridge.resolve_backend_source(preferences.backend_source)


def run_operator_bridge(context, preferences, backend_source):
    return bridge.run_bridge(
        bpy,
        context,
        backend_python=preferences.backend_python or sys.executable,
        backend_src_path=backend_source,
        export_format=preferences.export_format,
        job_root=preferences.job_root or None,
        timeout_seconds=preferences.timeout_seconds,
    )


def register():
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
