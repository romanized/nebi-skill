---
name: nebi-blender
description: "This Mac's Blender 5.3 setup: which route an agent takes, and the shell-only helper blendtool.py. Use when a sub-agent, lean builder or script with only a shell needs Blender, or for a one-shot job: inspect a .blend or model, render a preview sheet, convert between GLB, glTF, FBX, OBJ, USD, STL and PLY, weld and shrink an AI-generated mesh (Higgsfield, Hi3DGen, Meshy, Tripo), mix it with script-built parts, or turn it into a Roblox FBX or a compressed three.js GLB. Also to install, repair, start or stop the official Blender MCP server or a headless bridge, and to run the blender-* skills on that server. Not for modelling, retopology, UV, material, baking or export technique (blender-core and the blender-* skills), the Roblox text-to-model pipeline (roblox-3d-model), Roblox map layout (roblox-map), or tuning gltf-transform on a finished GLB (threejs-asset-pipeline)."
---

# nebi-blender

Blender 5.3 lives at `/Applications/Blender.app` (`blender` on PATH is the same build). This skill holds only what is specific to this Mac. Technique lives in the blender-* skills from [EL4CTEO/blender-skills](https://github.com/EL4CTEO/blender-skills), installed globally: `blender-core`, `-scene-setup`, `-hardsurface-modeling`, `-geometry-nodes`, `-retopology-uv`, `-pbr-materials`, `-texture-baking`, `-game-optimization`, `-export-pipelines`, `-asset-qa` and `-workflow-recipes`. Load `blender-core` for any real build and run `blender-asset-qa` before calling geometry done.

## Pick the route

| Situation | Route |
|---|---|
| A one-shot job from any shell: inspect, preview, convert, AI-mesh cleanup, Roblox FBX, web GLB | `python3 ~/.claude/skills/nebi-blender/tools/blendtool.py <command>`. JSON on stdout; exit 0 ok, 1 job failed (with a log tail), 2 bad usage or setup. |
| A blender-* skill script from a shell | `python3 ~/.claude/skills/blender-core/scripts/run_in_blender.py [--blend f.blend] ~/.claude/skills/<skill>/scripts/<x>.py -- <args>`. Prints only the script's JSON. |
| Work in the Blender window Nebi has open | The `blender` MCP server (official Blender Lab). Agents without MCP tools, such as nebi-builder, use `blendtool.py live "code"`, which reaches the same add-on on port 9876. |
| A live scene without the window, kept between steps | `blendtool.py serve` prints a pid and port; then `live --port N` as often as needed; then `stop --pid P`. |
| bpy API or manual lookup without MCP | Grep the official server's bundled docs: `~/.agents/nebi/blender-mcp/mcp/blmcp/data/api/` (one `.rst` per bpy module or type) and `data/manual/`. They are 5.1-era; `blender-core/references/api-changes-5x.md` lists what changed up to 5.3. |

`blendtool.py doctor` checks all of it in one call. Install or repair the MCP side with `blendtool.py setup-mcp` (details in [references/mcp.md](references/mcp.md)).

## blender-* skills on the official server

They were written for the community MCP server. On ours:

- `execute_blender_code` has the same name and returns both the `result` dict and anything printed, so their `print(x.run(...))` examples work. The skill scripts sit in `~/.claude/skills/<skill>/scripts`.
- `look` does not exist. Use `get_screenshot_of_area_as_image` or `get_screenshot_of_window_as_image` (window open), `render_thumbnail_to_path`, or headless `blender-asset-qa/scripts/review_shots.py` or `blendtool.py render`.
- `search_assets`, `import_asset` and `generate_3d` do not exist. Get the file first (higgsfield-generate makes 3D models), then import it.
- Recipes and blender-core's routing table name pack skills that are not installed (sculpting, rigging, animation, clothing, hair and others). Install one from its upstream register entry when a job needs it.

## Commands

| Command | Does |
|---|---|
| `run build.py [--input a.glb ...] [--blend s.blend] [--out o.glb] [--save-blend s.blend] [-- args]` | Runs your bpy script in an empty scene, or after importing the inputs, then exports. Template: [tools/examples/lamp_post.py](tools/examples/lamp_post.py). |
| `inspect FILE [--deep]` | Objects, transforms, evaluated tris, ngons, materials, images, exact world bbox. `--deep` adds non-manifold edges and loose verts. |
| `render IN OUT.png [--views iso,front,left,top] [--engine workbench\|eevee\|cycles]` | Auto-framed preview; several views also make a sheet. Read the PNG to check the work. |
| `convert IN OUT` | Any of glb, gltf, fbx, obj, usd/usda/usdc/usdz, stl, ply, blend in; output format from the extension. |
| `cleanup IN OUT [--weld] [--max-tris N] [--height H] [--origin bottom] [--planar] [--smooth 30] [--texture-max 1024]` | The fixes an AI mesh needs, in a safe order. |
| `roblox IN OUT.fbx [--max-tris 10000] [--height H]` | Roblox MeshPart mesh in studs (below). Also writes .glb or .obj. |
| `web IN OUT.glb [--compress meshopt\|draco\|quantize\|none] [--texture-compress webp\|ktx2\|avif\|auto\|none] [--keep-nodes]` | Clean GLB, then `gltf-transform optimize` and `validate`. Reports sizes and the three.js loader the output needs (threejs-loaders has the loader code). |
| `serve`, `live`, `stop` | The live bridge above. `live` returns whatever dict your code assigns to `result`. |

## Roblox: one unit convention per project

`blendtool.py roblox` treats a Blender unit as a stud (unit system None, `--height` in studs, Forward Z / Up Y FBX, origin at the bottom centre, 10,000 tris per mesh by default, never more than Roblox's 20,000). `blender-export-pipelines --preset roblox` treats it as a metre (a stud is about 0.28 m) and leaves the conversion to the FBX unit scale. Never mix the two in one project. Neither has been checked in a Studio import on this Mac, so compare the first import with a 5-stud R15 character; blendtool output needs World Forward Front and World Up Top in the 3D Importer. Rigs, cages, avatars and SurfaceAppearance: `blender-export-pipelines/references/roblox.md`. Text to MeshPart: roblox-3d-model.

## Safety: save first, work on copies

- Never write over the only copy of a `.blend` or a source model. Outputs go to a new path; the helper refuses to overwrite its input.
- Open downloaded `.blend` files only with factory startup, so their embedded scripts cannot run. `blendtool.py` adds `--factory-startup --disable-autoexec` (`run --prefs` loads Nebi's prefs when a job needs an add-on); `run_in_blender.py` uses factory startup unless you pass `--user-prefs`.
- `live` and `execute_blender_code` run in Nebi's open Blender with no guard: file writes and deletes are not undoable. Save the open file first (`bpy.ops.wm.save_mainfile()`) or work in a copy, and ask before touching a scene you did not create.
- Stop only the PID you started, with `blendtool.py stop --pid`; it refuses anything that is not a headless bridge. Never pkill or killall Blender: Nebi may have the window open.

## Gotchas

- A GLB from an AI generator imports as triangle soup: glTF splits every vertex per corner, so decimating it tears the mesh into confetti. `cleanup` and `roblox` weld on their own whenever they decimate (245,698 verts welded to 40,962 on a Hi3DGen-style test mesh). `auto_retopo.py --method decimate` (blender-retopology-uv) does not: on that mesh it left 9,988 loose pieces at 10,000 tris. Weld first with `cleanup --weld` or `make_lods.py --cleanup`, as recipe 5 in blender-workflow-recipes does.
- `uvx blender-mcp` installs the community package (telemetry on by default), not the official server. Use `setup-mcp`.
- The background bridge (`-c blender_mcp`) needs the user prefs where the add-on is enabled, so it cannot use `--factory-startup`, and it needs online access on (set by `setup-mcp`, or `--online-mode`).
- SIGINT does not stop a background bridge. `stop` asks the bridge to stop its own loop, so Blender exits cleanly, and only then falls back to SIGTERM.
- Blender 5.3's FBX exporter writes a unit scale of 100 even with unit system None. Geometry stays 1 unit = 1 stud and the round trip in Blender keeps the size.
- gltf-transform `optimize` flattens and joins nodes by default. Pass `--keep-nodes` when the page animates or looks up named parts.
- Agent shells often lack `/usr/local/bin` and `/usr/sbin` on PATH; the helper finds `npx`, `ktx` and `lsof` itself. KTX2 output needs KTX-Software (`ktx`), installed at `/usr/local/bin/ktx`.
