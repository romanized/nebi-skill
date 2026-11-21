"""Runs INSIDE Blender. blendtool.py starts it as:

    Blender -b [--factory-startup] [--disable-autoexec] [file.blend] --python blendjob.py -- job.json result.json

job.json keys (all optional): inputs, script, script_args, steps, render, export, save_blend, report, deep.
result.json gets {"ok": bool, "steps": [...], "warnings": [...], "report": {...}, "export": {...}, "render": {...}}.

Gotchas, each one measured on Blender 5.3:
- A GLB imports as a triangle soup: glTF stores normals per corner, so every vertex is split. "weld"
  clears custom split normals and merges by distance; decimating before welding under-reduces.
- Blender's front is -Y. Roblox's front (LookVector) is -Z, so the Roblox FBX uses axis_forward='Z',
  axis_up='Y' (Roblox docs: "Z Forward", "Y Up") and the scene Unit System NONE (1 unit = 1 stud).
- Triangle counts come from the evaluated mesh (modifiers applied), the same thing the exporters write.
- Images scaled in memory are packed, otherwise the FBX exporter copies the original file from disk.
"""

import json
import math
import os
import sys
import traceback

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

IMPORTERS = {
    ".glb": lambda p: bpy.ops.import_scene.gltf(filepath=p),
    ".gltf": lambda p: bpy.ops.import_scene.gltf(filepath=p),
    ".fbx": lambda p: bpy.ops.import_scene.fbx(filepath=p),
    ".obj": lambda p: bpy.ops.wm.obj_import(filepath=p),
    ".usd": lambda p: bpy.ops.wm.usd_import(filepath=p),
    ".usda": lambda p: bpy.ops.wm.usd_import(filepath=p),
    ".usdc": lambda p: bpy.ops.wm.usd_import(filepath=p),
    ".usdz": lambda p: bpy.ops.wm.usd_import(filepath=p),
    ".stl": lambda p: bpy.ops.wm.stl_import(filepath=p),
    ".ply": lambda p: bpy.ops.wm.ply_import(filepath=p),
}

RESULT = {"ok": False, "steps": [], "warnings": []}


def warn(msg):
    RESULT["warnings"].append(msg)


def mesh_objects():
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def tri_count(obj, depsgraph=None):
    depsgraph = depsgraph or bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(depsgraph)
    me = ev.to_mesh()
    try:
        me.calc_loop_triangles()
        return len(me.loop_triangles)
    finally:
        ev.to_mesh_clear()


def world_points(objs):
    """World-space vertex positions of the evaluated meshes, as one numpy (N, 3) array."""
    dg = bpy.context.evaluated_depsgraph_get()
    chunks = []
    for o in objs:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        try:
            n = len(me.vertices)
            if n:
                co = np.empty(n * 3, dtype=np.float64)
                me.vertices.foreach_get("co", co)
                m = np.array(o.matrix_world)
                chunks.append(co.reshape(n, 3) @ m[:3, :3].T + m[:3, 3])
        finally:
            ev.to_mesh_clear()
    return np.concatenate(chunks) if chunks else np.empty((0, 3))


def world_bbox(objs):
    """Exact world-space bounds of the evaluated meshes (bound_box corners overestimate rotated objects)."""
    pts = world_points(objs)
    if not len(pts):
        return None, None
    return Vector(pts.min(axis=0).tolist()), Vector(pts.max(axis=0).tolist())


def r3(v):
    return [round(x, 4) for x in v]


def single_user_data(objs):
    for o in objs:
        if o.data is not None and o.data.users > 1:
            o.data = o.data.copy()


# ---------------------------------------------------------------- steps

def step_weld(args):
    dist = float(args.get("dist", 0.0001))
    before = after = 0
    for o in mesh_objects():
        single_user_data([o])
        me = o.data
        if me.has_custom_normals:
            with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
                bpy.ops.mesh.customdata_custom_splitnormals_clear()
        bm = bmesh.new()
        bm.from_mesh(me)
        before += len(bm.verts)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
        after += len(bm.verts)
        bm.to_mesh(me)
        bm.free()
    return {"dist": dist, "verts_before": before, "verts_after": after}


def step_remove_loose(args):
    removed = 0
    for o in mesh_objects():
        single_user_data([o])
        bm = bmesh.new()
        bm.from_mesh(o.data)
        loose_e = [e for e in bm.edges if not e.link_faces]
        bmesh.ops.delete(bm, geom=loose_e, context="EDGES")
        loose_v = [v for v in bm.verts if not v.link_edges]
        removed += len(loose_v) + len(loose_e)
        bmesh.ops.delete(bm, geom=loose_v, context="VERTS")
        bm.to_mesh(o.data)
        bm.free()
    return {"removed_elements": removed}


def step_normals(args):
    for o in mesh_objects():
        single_user_data([o])
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(o.data)
        bm.free()
    return {"recalculated": len(mesh_objects())}


def step_flatten(args):
    """Clear every parent (keeping the world transform), then drop empties left with no children."""
    for o in list(bpy.context.scene.objects):
        if o.parent is not None:
            mw = o.matrix_world.copy()
            o.parent = None
            o.matrix_world = mw
    dropped = 0
    for o in list(bpy.context.scene.objects):
        if o.type == "EMPTY" and not o.children:
            bpy.data.objects.remove(o, do_unlink=True)
            dropped += 1
    return {"empties_removed": dropped}


def step_apply_transforms(args):
    step_flatten({})
    objs = mesh_objects()
    single_user_data(objs)
    for o in objs:
        o.data.transform(o.matrix_world)
        if o.matrix_world.determinant() < 0:
            o.data.flip_normals()
        o.matrix_world = Matrix.Identity(4)
    return {"applied": len(objs)}


def step_join(args):
    objs = mesh_objects()
    if len(objs) < 2:
        return {"joined": len(objs)}
    active = max(objs, key=lambda o: len(o.data.polygons))
    with bpy.context.temp_override(active_object=active, object=active,
                                   selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.join()
    if args.get("name"):
        active.name = args["name"]
    return {"joined": len(objs), "name": active.name}


def _apply_modifier_stack(o):
    dg = bpy.context.evaluated_depsgraph_get()
    new = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    old = o.data
    o.modifiers.clear()
    o.data = new
    if old.users == 0:
        bpy.data.meshes.remove(old)


def step_decimate(args):
    max_tris = args.get("max_tris")
    ratio = args.get("ratio")
    out = []
    for o in mesh_objects():
        single_user_data([o])
        before = tri_count(o)
        r = float(ratio) if ratio else (min(1.0, int(max_tris) / before) if before else 1.0)
        if r >= 0.999:
            out.append({"object": o.name, "tris": before, "decimated": False})
            continue
        m = o.modifiers.new("nb_decimate", "DECIMATE")
        m.decimate_type = "COLLAPSE"
        m.ratio = r
        m.use_collapse_triangulate = True
        _apply_modifier_stack(o)
        out.append({"object": o.name, "tris_before": before, "tris_after": tri_count(o), "ratio": round(r, 5)})
    return {"objects": out}


def step_planar(args):
    angle = math.radians(float(args.get("angle", 5.0)))
    for o in mesh_objects():
        single_user_data([o])
        m = o.modifiers.new("nb_planar", "DECIMATE")
        m.decimate_type = "DISSOLVE"
        m.angle_limit = angle
        _apply_modifier_stack(o)
    return {"angle_deg": math.degrees(angle), "tris": sum(tri_count(o) for o in mesh_objects())}


def step_triangulate(args):
    for o in mesh_objects():
        single_user_data([o])
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.triangulate(bm, faces=bm.faces, quad_method="BEAUTY", ngon_method="BEAUTY")
        bm.to_mesh(o.data)
        bm.free()
    return {"tris": sum(tri_count(o) for o in mesh_objects())}


def step_smooth(args):
    angle = args.get("angle")
    for o in mesh_objects():
        single_user_data([o])
        if angle is None:
            o.data.shade_flat()
        else:
            o.data.shade_smooth()
            o.data.set_sharp_from_angle(angle=math.radians(float(angle)))
    return {"angle_deg": angle}


def _roots():
    return [o for o in bpy.context.scene.objects if o.parent is None and o.type in {"MESH", "EMPTY", "ARMATURE"}]


def step_fit(args):
    lo, hi = world_bbox(mesh_objects())
    if lo is None:
        raise RuntimeError("fit: no mesh objects")
    size = hi - lo
    if args.get("height"):
        cur, want, what = size.z, float(args["height"]), "height"
    else:
        cur, want, what = max(size), float(args["longest"]), "longest"
    if cur <= 0:
        raise RuntimeError("fit: model has zero %s" % what)
    s = want / cur
    scale = Matrix.Scale(s, 4)
    for o in _roots():
        o.matrix_world = scale @ o.matrix_world
    bpy.context.view_layer.update()
    lo2, hi2 = world_bbox(mesh_objects())
    return {"what": what, "factor": round(s, 6), "dimensions": r3(hi2 - lo2)}


def step_origin(args):
    mode = args.get("mode", "bottom")
    bpy.context.view_layer.update()
    lo, hi = world_bbox(mesh_objects())
    if lo is None:
        raise RuntimeError("origin: no mesh objects")
    c = (lo + hi) / 2
    target = Vector((c.x, c.y, lo.z)) if mode == "bottom" else c
    shift = Matrix.Translation(-target)
    meshes = mesh_objects()
    if len(meshes) == 1 and meshes[0].parent is None and not meshes[0].children:
        o = meshes[0]
        single_user_data([o])
        # Move the geometry so the object's own origin (the Roblox pivot) sits at the target point.
        local = o.matrix_world.inverted() @ target
        o.data.transform(Matrix.Translation(-local))
        o.matrix_world = shift @ o.matrix_world @ Matrix.Translation(local)
    else:
        for o in _roots():
            o.matrix_world = shift @ o.matrix_world
    bpy.context.view_layer.update()
    lo2, hi2 = world_bbox(mesh_objects())
    return {"mode": mode, "moved_by": r3(-target), "bbox_min": r3(lo2), "bbox_max": r3(hi2)}


def step_texture_max(args):
    size = int(args.get("size", 1024))
    changed = []
    for img in bpy.data.images:
        if img.type != "IMAGE":
            continue
        w, h = img.size
        if max(w, h) > size:
            k = size / max(w, h)
            img.scale(max(1, int(w * k)), max(1, int(h * k)))
            img.pack()
            changed.append({"image": img.name, "from": [w, h], "to": list(img.size)})
    return {"max": size, "resized": changed}


def step_units_studs(args):
    us = bpy.context.scene.unit_settings
    us.system = "NONE"
    us.scale_length = 1.0
    return {"unit_system": "NONE", "note": "1 Blender unit = 1 Roblox stud"}


STEPS = {
    "weld": step_weld, "remove_loose": step_remove_loose, "normals": step_normals,
    "flatten": step_flatten, "apply_transforms": step_apply_transforms, "join": step_join,
    "decimate": step_decimate, "planar": step_planar, "triangulate": step_triangulate,
    "smooth": step_smooth, "fit": step_fit, "origin": step_origin, "texture_max": step_texture_max,
    "units_studs": step_units_studs,
}


# ---------------------------------------------------------------- report

def build_report(deep=False):
    dg = bpy.context.evaluated_depsgraph_get()
    scene = bpy.context.scene
    objs = []
    total_tris = 0
    for o in scene.objects:
        loc, rot, scale = o.matrix_basis.decompose()  # glTF imports use quaternions; rotation_euler would read 0
        row = {
            "name": o.name, "type": o.type,
            "parent": o.parent.name if o.parent else None,
            "location": r3(loc),
            "rotation_deg": r3(math.degrees(a) for a in rot.to_euler()),
            "scale": r3(scale),
            "dimensions": r3(o.dimensions),
        }
        if o.type == "MESH":
            me = o.data
            tris = tri_count(o, dg)
            total_tris += tris
            lo, hi = world_bbox([o])
            ngons = sum(1 for p in me.polygons if p.loop_total > 4)
            row.update({
                "verts": len(me.vertices), "faces": len(me.polygons), "tris": tris, "ngons": ngons,
                "materials": [m.name if m else None for m in me.materials],
                "uv_layers": [uv.name for uv in me.uv_layers],
                "custom_normals": me.has_custom_normals,
                "modifiers": [m.type for m in o.modifiers],
                "bbox_min": r3(lo), "bbox_max": r3(hi),
                "transform_applied": o.matrix_world == Matrix.Identity(4),
            })
            if deep:
                bm = bmesh.new()
                bm.from_mesh(me)
                row["non_manifold_edges"] = sum(1 for e in bm.edges if not e.is_manifold)
                row["loose_verts"] = sum(1 for v in bm.verts if not v.link_edges)
                bm.free()
        objs.append(row)
    meshes = mesh_objects()
    lo, hi = world_bbox(meshes)
    mats = []
    for m in bpy.data.materials:
        if m.users == 0:
            continue
        imgs = []
        if m.node_tree:
            imgs = sorted({n.image.name for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image})
        mats.append({"name": m.name, "images": imgs})
    images = [{"name": i.name, "size": list(i.size), "packed": bool(i.packed_file),
               "file": i.filepath or None} for i in bpy.data.images if i.type == "IMAGE" and i.users]
    return {
        "file": bpy.data.filepath or None,
        "blender": bpy.app.version_string,
        "unit_system": scene.unit_settings.system,
        "unit_scale": scene.unit_settings.scale_length,
        "objects_total": len(scene.objects),
        "mesh_objects": len(meshes),
        "tris_total": total_tris,
        "bbox_min": r3(lo) if lo else None,
        "bbox_max": r3(hi) if hi else None,
        "dimensions": r3(hi - lo) if lo else None,
        "materials": mats,
        "images": images,
        "actions": [a.name for a in bpy.data.actions],
        "objects": objs,
    }


# ---------------------------------------------------------------- render

VIEW_DIRS = {
    "iso": (1.0, -1.0, 0.8), "front": (0.0, -1.0, 0.0), "back": (0.0, 1.0, 0.0),
    "left": (-1.0, 0.0, 0.0), "right": (1.0, 0.0, 0.0), "top": (0.0, -0.001, 1.0),
}


def render(spec):
    scene = bpy.context.scene
    meshes = [o for o in mesh_objects() if not o.hide_render]
    lo, hi = world_bbox(meshes)
    if lo is None:
        raise RuntimeError("render: nothing to render (no mesh objects)")
    center = (lo + hi) / 2
    radius = max((hi - lo).length / 2, 1e-4)
    size = int(spec.get("size", 1024))
    engine = spec.get("engine", "workbench").lower()
    scene.render.engine = {"workbench": "BLENDER_WORKBENCH", "eevee": "BLENDER_EEVEE", "cycles": "CYCLES"}[engine]
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    if engine == "workbench":
        sh = scene.display.shading
        sh.light = "STUDIO"
        # TEXTURE mode draws untextured materials grey, so only use it when an image texture exists.
        textured = any(m.node_tree and any(n.type == "TEX_IMAGE" and n.image for n in m.node_tree.nodes)
                       for m in bpy.data.materials if m.users)
        sh.color_type = "TEXTURE" if textured else "MATERIAL"
        # MATERIAL mode draws the viewport colour, which stays grey for script-built node materials:
        # copy the Principled base colour over (only in this throwaway render session).
        for m in bpy.data.materials:
            bsdf = m.node_tree and next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bsdf and not bsdf.inputs["Base Color"].is_linked:
                m.diffuse_color = bsdf.inputs["Base Color"].default_value
        sh.show_cavity = True
        sh.show_shadows = True
    if engine == "cycles":
        scene.cycles.samples = int(spec.get("samples", 64))
    if scene.world is None:
        scene.world = bpy.data.worlds.new("nb_world")
    scene.world.color = (0.18, 0.18, 0.2)
    if scene.world.node_tree and "Background" in scene.world.node_tree.nodes:
        scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.18, 0.18, 0.2, 1)

    if engine != "workbench" and not any(o.type == "LIGHT" for o in scene.objects):
        for name, rot, energy in (("nb_key", (0.9, 0.2, 0.6), 4.0), ("nb_fill", (1.1, 0.0, -2.4), 1.5)):
            ld = bpy.data.lights.new(name, "SUN")
            ld.energy = energy
            lo_ = bpy.data.objects.new(name, ld)
            lo_.rotation_euler = rot
            scene.collection.objects.link(lo_)

    cam_data = bpy.data.cameras.new("nb_cam")
    cam_data.lens = 50
    cam_data.clip_start = radius * 0.01
    cam_data.clip_end = radius * 100
    cam = bpy.data.objects.new("nb_cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    tan_half = cam_data.sensor_width / (2 * cam_data.lens)
    pts = world_points(meshes)
    pts = pts[:: max(1, len(pts) // 200000)] - np.array(center)  # framing needs a sample, not every vertex

    views = spec.get("views") or ["iso"]
    out = spec["out"]
    base, ext = os.path.splitext(out)
    files = []
    for v in views:
        d = Vector(VIEW_DIRS[v]).normalized()
        rot = (-d).to_track_quat("-Z", "Y")
        right, up = rot @ Vector((1, 0, 0)), rot @ Vector((0, 1, 0))
        x, y, z = pts @ np.array(right), pts @ np.array(up), pts @ np.array(d)
        extent = np.maximum(np.abs(x), np.abs(y))
        if v == "iso":  # perspective, pulled back just far enough that every vertex is in frame
            cam_data.type = "PERSP"
            dist = float((extent / tan_half + z).max()) * 1.06
        else:  # straight views are orthographic so proportions can be read off the image
            cam_data.type = "ORTHO"
            cam_data.ortho_scale = float(extent.max()) * 2.12
            dist = radius * 3
        cam.location = center + d * dist
        cam.rotation_euler = rot.to_euler()
        path = out if len(views) == 1 else "%s_%s%s" % (base, v, ext or ".png")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        files.append(path)
    result = {"engine": engine, "size": size, "views": views, "files": files}
    if len(views) > 1:
        result["sheet"] = make_sheet(files, out, size)
    bpy.data.objects.remove(cam, do_unlink=True)
    return result


def make_sheet(files, out, size):
    cols = 2 if len(files) <= 4 else 3
    rows = math.ceil(len(files) / cols)
    sheet = np.zeros((rows * size, cols * size, 4), dtype=np.float32)
    for i, f in enumerate(files):
        img = bpy.data.images.load(f)
        px = np.empty(size * size * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        r, c = rows - 1 - i // cols, i % cols  # Blender pixel rows start at the bottom
        sheet[r * size:(r + 1) * size, c * size:(c + 1) * size] = px.reshape(size, size, 4)
        bpy.data.images.remove(img)
    img = bpy.data.images.new("nb_sheet", cols * size, rows * size, alpha=True)
    img.pixels.foreach_set(sheet.ravel())
    img.filepath_raw = out
    img.file_format = "PNG"
    img.save()
    return out


# ---------------------------------------------------------------- export

def export(spec):
    path = os.path.abspath(spec["path"])
    preset = spec.get("preset", "default")
    ext = os.path.splitext(path)[1].lower()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    animated = bool(bpy.data.actions)
    if ext in (".glb", ".gltf"):
        bpy.ops.export_scene.gltf(
            filepath=path, export_format="GLB" if ext == ".glb" else "GLTF_SEPARATE",
            export_apply=True, export_yup=True, export_animations=animated)
    elif ext == ".fbx":
        kw = dict(filepath=path, use_mesh_modifiers=True, path_mode="COPY", embed_textures=True,
                  apply_scale_options="FBX_SCALE_UNITS", bake_anim=animated)
        if preset == "roblox":
            kw.update(object_types={"MESH", "ARMATURE", "EMPTY"}, axis_forward="Z", axis_up="Y",
                      mesh_smooth_type="FACE", add_leaf_bones=False, use_triangles=True)
        bpy.ops.export_scene.fbx(**kw)
    elif ext == ".obj":
        kw = dict(filepath=path, apply_modifiers=True, export_materials=True, path_mode="COPY")
        if preset == "roblox":
            kw.update(forward_axis="Z", up_axis="Y", export_triangulated_mesh=True)
        bpy.ops.wm.obj_export(**kw)
    elif ext in (".usd", ".usda", ".usdc", ".usdz"):
        bpy.ops.wm.usd_export(filepath=path, export_materials=True)
    elif ext == ".stl":
        bpy.ops.wm.stl_export(filepath=path, apply_modifiers=True)
    elif ext == ".ply":
        bpy.ops.wm.ply_export(filepath=path, apply_modifiers=True)
    elif ext == ".blend":
        bpy.ops.wm.save_as_mainfile(filepath=path, copy=True)
    else:
        raise RuntimeError("export: unsupported extension %r" % ext)
    if not os.path.isfile(path) or os.path.getsize(path) == 0:
        raise RuntimeError("export: %s was not written" % path)
    return {"path": path, "bytes": os.path.getsize(path), "preset": preset}


# ---------------------------------------------------------------- main

def run_script(path, args):
    old_argv = sys.argv
    sys.argv = [path] + list(args)
    try:
        code = compile(open(path, encoding="utf-8").read(), path, "exec")
        exec(code, {"__name__": "__main__", "__file__": path})
    finally:
        sys.argv = old_argv


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    job_path, result_path = argv[0], argv[1]
    with open(job_path, encoding="utf-8") as fh:
        job = json.load(fh)
    try:
        if not bpy.data.filepath and job.get("empty", True):
            bpy.ops.wm.read_factory_settings(use_empty=True)
        for p in job.get("inputs", []):
            ext = os.path.splitext(p)[1].lower()
            if ext not in IMPORTERS:
                raise RuntimeError("import: unsupported extension %r (%s)" % (ext, p))
            n = len(bpy.data.objects)
            IMPORTERS[ext](os.path.abspath(p))
            RESULT["steps"].append({"op": "import", "file": p, "new_objects": len(bpy.data.objects) - n})
        if job.get("script"):
            run_script(job["script"], job.get("script_args", []))
            RESULT["steps"].append({"op": "script", "file": job["script"]})
        for st in job.get("steps", []):
            st = dict(st)
            op = st.pop("op")
            RESULT["steps"].append({"op": op, **STEPS[op](st)})
        bpy.context.view_layer.update()
        if job.get("budget"):
            limit = int(job["budget"])
            for o in mesh_objects():
                t = tri_count(o)
                if t > limit:
                    warn("%s has %d tris, over the %d per-mesh budget" % (o.name, t, limit))
        if job.get("report", True):
            RESULT["report"] = build_report(job.get("deep", False))
        if job.get("render"):
            RESULT["render"] = render(job["render"])
        if job.get("export"):
            RESULT["export"] = export(job["export"])
        if job.get("save_blend"):
            bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(job["save_blend"]), copy=True)
            RESULT["saved_blend"] = os.path.abspath(job["save_blend"])
        RESULT["ok"] = True
    except Exception as ex:  # report every failure as JSON, never a bare traceback
        RESULT["error"] = "%s: %s" % (type(ex).__name__, ex)
        RESULT["traceback"] = traceback.format_exc()
    with open(result_path, "w", encoding="utf-8") as fh:
        json.dump(RESULT, fh, indent=1, default=repr)


main()
