"""Example build script for `blendtool.py run`: a low-poly street lamp, 1 unit = 1 stud.

    python3 blendtool.py run examples/lamp_post.py --save-blend lamp.blend --out lamp.glb -- --height 12

Runs inside Blender with an empty scene. Sizes are in Blender units (= studs for Roblox, metres for the web).
"""

import argparse
import sys

import bpy

ap = argparse.ArgumentParser()
ap.add_argument("--height", type=float, default=12.0)
args = ap.parse_args(sys.argv[1:])
h = args.height


def material(name, rgba, metallic=0.0, roughness=0.6, emission=0.0):
    m = bpy.data.materials.new(name)
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = rgba
        bsdf.inputs["Emission Strength"].default_value = emission
    return m


iron = material("Iron", (0.08, 0.09, 0.1, 1), metallic=1.0, roughness=0.45)
glass = material("LampGlass", (1.0, 0.82, 0.45, 1), roughness=0.2, emission=3.0)

bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.9, depth=0.6, location=(0, 0, 0.3))
base = bpy.context.active_object
base.name = "Base"

bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.25, depth=h - 2.0, location=(0, 0, 0.6 + (h - 2.0) / 2))
post = bpy.context.active_object
post.name = "Post"

bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, h - 0.9))
lamp = bpy.context.active_object
lamp.name = "Lamp"
lamp.scale = (1.1, 1.1, 1.4)

bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=1.1, depth=0.8, location=(0, 0, h + 0.2))
cap = bpy.context.active_object
cap.name = "Cap"
cap.rotation_euler[2] = 0.785398

for o, m in ((base, iron), (post, iron), (lamp, glass), (cap, iron)):
    o.data.materials.append(m)

print("lamp_post: built", [o.name for o in bpy.context.scene.objects])
