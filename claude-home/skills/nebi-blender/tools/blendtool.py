#!/usr/bin/env python3
"""Headless Blender for any agent with a shell: no MCP, stdlib only, JSON on stdout.

    python3 blendtool.py doctor
    python3 blendtool.py inspect model.glb [--deep]
    python3 blendtool.py run build.py [--input a.glb ...] [--blend scene.blend] [--out out.glb] [--save-blend s.blend] [-- args]
    python3 blendtool.py convert in.fbx out.glb
    python3 blendtool.py render in.glb out.png [--views iso,front,left,top] [--engine workbench|eevee|cycles] [--size 768]
    python3 blendtool.py cleanup in.glb out.glb [--weld] [--max-tris N] [--height H] [--origin bottom] ...
    python3 blendtool.py roblox in.glb out.fbx [--max-tris 10000] [--height 6]
    python3 blendtool.py web in.blend out.glb [--compress meshopt|draco|quantize|none] [--texture-compress webp|ktx2|avif|auto|none]
    python3 blendtool.py serve [--port N] [--blend f.blend]      # headless MCP bridge, prints its pid and port
    python3 blendtool.py live "code" [--port 9876] | --file f.py  # run Python in a live Blender (GUI or serve)
    python3 blendtool.py stop --pid PID                           # stops a bridge that serve started, nothing else
    python3 blendtool.py setup-mcp                                # (re)install the official MCP add-on + server

Exit codes: 0 ok, 1 the Blender job failed (JSON has "error" and a log tail), 2 bad usage or setup.
Gotchas:
- Every job runs Blender with --factory-startup (user add-ons and prefs stay out, results repeat) and
  --disable-autoexec (scripts embedded in a .blend never run). `run --prefs` loads the user's prefs.
- Write job outputs outside the source folder you were given; work on copies, never on the only .blend.
- `live` code runs inside the user's open Blender with no undo of side effects: save first.
- Assign a dict to `result` in live code to get data back.
"""

import argparse
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
JOB_SCRIPT = os.path.join(HERE, "blendjob.py")
MCP_DIR = os.path.expanduser("~/.agents/nebi/blender-mcp")
MCP_REPO = "https://projects.blender.org/lab/blender_mcp.git"
MCP_PIN = "dbbf836ad4b1025f14a2b3b504c43903f39e0b04"  # main, 2026-09-29, after v1.0.3
ADDON_MODULE = "bl_ext.user_default.mcp"
GLTF_TRANSFORM = "@gltf-transform/cli@4.5.1"
ROBLOX_MESH_CAP = 20000
# Absolute paths: an agent's bare shell often has no /usr/sbin on PATH.
LSOF = "/usr/sbin/lsof" if os.path.exists("/usr/sbin/lsof") else "lsof"
PS = "/bin/ps" if os.path.exists("/bin/ps") else "ps"


def out(obj, code=0):
    print(json.dumps(obj, indent=1, default=str))
    sys.exit(code)


def fail(msg, code=2, **extra):
    out({"ok": False, "error": msg, **extra}, code)


def find_blender():
    for cand in (os.environ.get("BLENDER"), "/Applications/Blender.app/Contents/MacOS/Blender",
                 shutil.which("blender")):
        if cand and os.path.isfile(cand) and os.access(cand, os.X_OK):
            return cand
    fail("Blender not found: set BLENDER or install /Applications/Blender.app")


def find_tool(name):
    """PATH first, then the usual macOS install folders an agent's bare shell may not have on PATH."""
    for cand in (shutil.which(name), "/opt/homebrew/bin/" + name, "/usr/local/bin/" + name):
        if cand and os.path.isfile(cand) and os.access(cand, os.X_OK):
            return cand
    return None


def blender_version(blender):
    first = subprocess.run([blender, "--version"], capture_output=True, text=True, timeout=60).stdout.split("\n")[0]
    m = re.search(r"Blender (\d+)\.(\d+)\.(\d+)", first)
    return m.group(0).split()[1] if m else first.strip()


def tail(path, n=40):
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            return fh.read().splitlines()[-n:]
    except OSError:
        return []


def run_job(job, blend=None, prefs=False, timeout=1800):
    """Run blendjob.py inside headless Blender. Returns the parsed result dict."""
    blender = find_blender()
    work = tempfile.mkdtemp(prefix="nebi-blender-")
    job_path = os.path.join(work, "job.json")
    result_path = os.path.join(work, "result.json")
    log_path = os.path.join(work, "blender.log")
    with open(job_path, "w", encoding="utf-8") as fh:
        json.dump(job, fh)
    cmd = [blender, "-b"]
    if not prefs:
        cmd.append("--factory-startup")
    cmd.append("--disable-autoexec")
    if blend:
        cmd.append(os.path.abspath(blend))
    cmd += ["--python-exit-code", "1", "--python", JOB_SCRIPT, "--", job_path, result_path]
    t0 = time.time()
    try:
        with open(log_path, "w", encoding="utf-8") as log:
            proc = subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT, timeout=timeout)
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "Blender timed out after %ds" % timeout, "log": log_path, "log_tail": tail(log_path)}
    if not os.path.isfile(result_path):
        return {"ok": False, "error": "Blender exited %d without a result" % proc.returncode,
                "log": log_path, "log_tail": tail(log_path)}
    with open(result_path, encoding="utf-8") as fh:
        result = json.load(fh)
    result["seconds"] = round(time.time() - t0, 2)
    result["log"] = log_path
    if not result.get("ok"):
        result["log_tail"] = tail(log_path)
    return result


def finish(result):
    out(result, 0 if result.get("ok") else 1)


def split_input(path):
    """A .blend opens as the scene; anything else is imported into an empty scene."""
    if not os.path.isfile(path):
        fail("no such file: %s" % path)
    if path.lower().endswith(".blend"):
        return path, []
    return None, [os.path.abspath(path)]


def same_file(a, b):
    return os.path.abspath(a) == os.path.abspath(b)


# ---------------------------------------------------------------- mesh commands

def cleanup_steps(a, preset):
    steps = []
    weld = a.weld
    if weld is None and (a.max_tris or a.ratio):
        weld = 0.0001  # decimating an unwelded GLB tears it into confetti (measured), so weld first
    if weld:
        steps.append({"op": "weld", "dist": weld})
    if a.remove_loose:
        steps.append({"op": "remove_loose"})
    if a.normals:
        steps.append({"op": "normals"})
    if a.apply_transforms:
        steps.append({"op": "apply_transforms"})
    if a.join:
        steps.append({"op": "join", "name": a.name})
    if a.planar is not None:
        steps.append({"op": "planar", "angle": a.planar})
    if a.max_tris or a.ratio:
        steps.append({"op": "decimate", "max_tris": a.max_tris, "ratio": a.ratio})
    if a.height or a.longest:  # after decimation, which nudges the extents
        steps.append({"op": "fit", "height": a.height, "longest": a.longest})
        steps.append({"op": "apply_transforms"})
    if a.origin and a.origin != "keep":
        steps.append({"op": "origin", "mode": a.origin})
    if preset == "roblox":
        steps.append({"op": "triangulate"})
    if a.smooth_angle is not None:
        steps.append({"op": "smooth", "angle": None if a.smooth_angle < 0 else a.smooth_angle})
    if a.texture_max:
        steps.append({"op": "texture_max", "size": a.texture_max})
    if preset == "roblox":
        steps.append({"op": "units_studs"})
    return steps


def add_cleanup_flags(p, roblox=False):
    p.add_argument("--weld", type=float, nargs="?", const=0.0001, default=0.0001 if roblox else None,
                   help="merge by distance (default dist 0.0001); fixes GLB triangle soup. On by itself when decimating")
    p.add_argument("--no-weld", dest="weld", action="store_const", const=False)
    p.add_argument("--remove-loose", action="store_true", default=roblox)
    p.add_argument("--normals", action="store_true", default=roblox, help="recalculate normals outside")
    p.add_argument("--apply-transforms", action="store_true", default=roblox,
                   help="flatten the hierarchy and bake transforms into the meshes")
    p.add_argument("--height", type=float, help="scale uniformly to this height (Z), in Blender units / studs")
    p.add_argument("--longest", type=float, help="scale uniformly so the longest side is this long")
    p.add_argument("--join", action="store_true", help="join all meshes into one object")
    p.add_argument("--name", help="name for the joined object")
    p.add_argument("--planar", type=float, help="dissolve planar faces under this angle (degrees)")
    p.add_argument("--max-tris", type=int, default=10000 if roblox else None, help="decimate each mesh to at most N tris")
    p.add_argument("--ratio", type=float, help="decimate every mesh by this ratio instead")
    p.add_argument("--origin", choices=["bottom", "center", "keep"], default="bottom" if roblox else None)
    p.add_argument("--smooth-angle", type=float, default=30.0 if roblox else None,
                   help="smooth shading with edges sharper than this angle kept sharp; -1 = flat")
    p.add_argument("--texture-max", type=int, default=1024 if roblox else None, help="downscale textures above N px")
    p.add_argument("--deep", action="store_true", help="also count non-manifold edges and loose verts")


def cmd_inspect(a):
    blend, inputs = split_input(a.file)
    finish(run_job({"inputs": inputs, "deep": a.deep}, blend))


def cmd_convert(a):
    blend, inputs = split_input(a.input)
    if same_file(a.input, a.output):
        fail("output would overwrite the input; write to a new path")
    finish(run_job({"inputs": inputs, "export": {"path": a.output}, "report": False}, blend))


def cmd_render(a):
    blend, inputs = split_input(a.input)
    views = [v.strip() for v in a.views.split(",") if v.strip()]
    bad = [v for v in views if v not in ("iso", "front", "back", "left", "right", "top")]
    if bad:
        fail("unknown view(s): %s" % ", ".join(bad))
    job = {"inputs": inputs, "report": False,
           "render": {"out": os.path.abspath(a.output), "size": a.size, "engine": a.engine, "views": views,
                      "samples": a.samples}}
    finish(run_job(job, blend))


def cmd_cleanup(a, preset="default"):
    blend, inputs = split_input(a.input)
    if same_file(a.input, a.output):
        fail("output would overwrite the input; write to a new path")
    job = {"inputs": inputs, "steps": cleanup_steps(a, preset), "deep": a.deep,
           "export": {"path": a.output, "preset": preset}}
    if preset == "roblox":
        job["budget"] = a.max_tris or ROBLOX_MESH_CAP
    finish(run_job(job, blend))


def cmd_roblox(a):
    if a.max_tris and a.max_tris > ROBLOX_MESH_CAP:
        fail("Roblox rejects meshes over %d triangles; pick --max-tris <= %d" % (ROBLOX_MESH_CAP, ROBLOX_MESH_CAP))
    if not a.output.lower().endswith((".fbx", ".glb", ".gltf", ".obj")):
        fail("Roblox imports .fbx, .glb/.gltf or .obj")
    cmd_cleanup(a, "roblox")


def cmd_web(a):
    blend, inputs = split_input(a.input)
    if same_file(a.input, a.output) or not a.output.lower().endswith(".glb"):
        fail("web writes a new .glb; give an output path that is not the input")
    raw = os.path.splitext(os.path.abspath(a.output))[0] + ".raw.glb"
    job = {"inputs": inputs, "steps": cleanup_steps(a, "web"), "deep": a.deep, "export": {"path": raw, "preset": "web"}}
    result = run_job(job, blend)
    if not result.get("ok"):
        finish(result)
    ktx = find_tool("ktx")
    if a.texture_compress == "ktx2" and not ktx:
        result.update(ok=False, error="KTX2 needs the `ktx` CLI (KTX-Software 4.4+); use webp or install it")
        finish(result)
    npx = find_tool("npx")
    if not npx:
        result.update(ok=False, error="npx not found; install Node.js")
        finish(result)
    env = dict(os.environ)  # gltf-transform shells out to `ktx` and npx needs node: put both on PATH
    env["PATH"] = os.pathsep.join([os.path.dirname(npx)] + ([os.path.dirname(ktx)] if ktx else [])
                                  + [env.get("PATH", "/usr/bin:/bin")])
    opt = [npx, "-y", GLTF_TRANSFORM, "optimize", raw, os.path.abspath(a.output),
           "--compress", "false" if a.compress == "none" else a.compress,
           "--texture-compress", "false" if a.texture_compress == "none" else a.texture_compress,
           "--texture-size", str(a.texture_size)]
    if a.no_simplify:
        opt += ["--simplify", "false"]
    if a.keep_nodes:
        opt += ["--flatten", "false", "--join", "false"]
    p = subprocess.run(opt, capture_output=True, text=True, timeout=1800, env=env)
    gt = {"cmd": " ".join(opt[1:]), "exit": p.returncode,
          "output_tail": (p.stdout + p.stderr).strip().splitlines()[-15:]}
    if p.returncode == 0:
        v = subprocess.run([npx, "-y", GLTF_TRANSFORM, "validate", os.path.abspath(a.output)],
                           capture_output=True, text=True, timeout=600, env=env)
        gt["validate_exit"] = v.returncode
        gt["validate_tail"] = (v.stdout + v.stderr).strip().splitlines()[-12:]
    loaders = {"draco": "GLTFLoader.setDRACOLoader(new DRACOLoader())",
               "meshopt": "GLTFLoader.setMeshoptDecoder(MeshoptDecoder)",
               "quantize": "none (KHR_mesh_quantization loads natively)", "none": "none"}
    result["gltf_transform"] = gt
    result["web"] = {"raw_glb": raw, "raw_bytes": os.path.getsize(raw),
                     "optimized_glb": os.path.abspath(a.output),
                     "optimized_bytes": os.path.getsize(a.output) if os.path.isfile(a.output) else None,
                     "three_loader": loaders[a.compress] + (
                         "; KTX2Loader().detectSupport(renderer)" if a.texture_compress == "ktx2" else "")}
    result["ok"] = p.returncode == 0 and gt.get("validate_exit", 1) == 0
    if not result["ok"]:
        result["error"] = "gltf-transform optimize or validate failed; see gltf_transform"
    finish(result)


def cmd_run(a):
    if not os.path.isfile(a.script):
        fail("no such script: %s" % a.script)
    for f in a.input + ([a.blend] if a.blend else []):
        if not os.path.isfile(f):
            fail("no such file: %s" % f)
    job = {"inputs": [os.path.abspath(f) for f in a.input], "script": os.path.abspath(a.script),
           "script_args": a.script_args, "report": not a.no_report}
    if a.out:
        job["export"] = {"path": a.out, "preset": a.preset}
    if a.save_blend:
        if a.blend and same_file(a.blend, a.save_blend):
            fail("--save-blend would overwrite the input .blend; save to a new path")
        job["save_blend"] = a.save_blend
    finish(run_job(job, a.blend, prefs=a.prefs, timeout=a.timeout))


# ---------------------------------------------------------------- live bridge

def bridge_call(code, host, port, timeout=300.0):
    """The official add-on's protocol: one JSON request, NUL-terminated; one JSON reply, NUL-terminated."""
    req = json.dumps({"type": "execute", "code": code, "strict_json": False}) + "\0"
    with socket.create_connection((host, port), timeout=timeout) as s:
        s.sendall(req.encode("utf-8"))
        buf = bytearray()
        while b"\0" not in buf:
            chunk = s.recv(65536)
            if not chunk:
                break
            buf.extend(chunk)
    return json.loads(bytes(buf).partition(b"\0")[0].decode("utf-8"))


def port_open(host, port):
    try:
        with socket.create_connection((host, port), timeout=1.0):
            return True
    except OSError:
        return False


def cmd_live(a):
    if a.file:
        code = open(a.file, encoding="utf-8").read()
    elif a.code == "-" or a.code is None:
        code = sys.stdin.read()
    else:
        code = a.code
    if not port_open(a.host, a.port):
        fail("no Blender bridge on %s:%d. Open Blender (the MCP add-on autostarts) or run `serve`." % (a.host, a.port))
    try:
        resp = bridge_call(code, a.host, a.port, a.timeout)
    except (OSError, ValueError) as ex:
        fail("bridge call failed: %s" % ex, 1)
    out(resp, 0 if resp.get("status") == "ok" else 1)


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def cmd_serve(a):
    blender = find_blender()
    port = a.port or free_port()
    if port_open("127.0.0.1", port):
        fail("port %d is already in use" % port)
    logdir = os.path.join(tempfile.gettempdir(), "nebi-blender")
    os.makedirs(logdir, exist_ok=True)
    log_path = os.path.join(logdir, "serve-%d.log" % port)
    cmd = [blender, "-b", "--online-mode"]
    if a.blend:
        cmd.append(os.path.abspath(a.blend))
    cmd += ["-c", "blender_mcp", "--port", str(port)]
    with open(log_path, "w", encoding="utf-8") as log:
        proc = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                                start_new_session=True)
    deadline = time.time() + a.wait
    while time.time() < deadline:
        if proc.poll() is not None:
            fail("Blender exited %d before the bridge came up (is the MCP add-on installed? run setup-mcp)"
                 % proc.returncode, 1, log=log_path, log_tail=tail(log_path))
        if port_open("127.0.0.1", port):
            out({"ok": True, "pid": proc.pid, "port": port, "log": log_path,
                 "live": "python3 %s live --port %d \"<code>\"" % (os.path.abspath(__file__), port),
                 "mcp_env": "BLENDER_MCP_PORT=%d" % port,
                 "stop": "python3 %s stop --pid %d" % (os.path.abspath(__file__), proc.pid)})
        time.sleep(0.25)
    fail("bridge did not open port %d within %ds; pid %d left running, stop it with `stop --pid %d`"
         % (port, a.wait, proc.pid, proc.pid), 1, log=log_path)


def cmd_stop(a):
    ps = subprocess.run([PS, "-o", "command=", "-p", str(a.pid)], capture_output=True, text=True)
    command = ps.stdout.strip()
    if not command:
        fail("no process %d" % a.pid, 1)
    if "Blender" not in command or "blender_mcp" not in command or " -b" not in command:
        fail("pid %d is not a headless Blender bridge started by serve; refusing to stop it" % a.pid,
             command=command)
    def gone(wait):
        for _ in range(wait * 10):
            if subprocess.run([PS, "-p", str(a.pid)], capture_output=True).returncode != 0:
                return True
            time.sleep(0.1)
        return False

    # Clean exit: ask the bridge to stop its own loop, so Blender returns from `-c blender_mcp` and quits.
    # SIGINT does nothing here (Blender's embedded Python never sees KeyboardInterrupt).
    ls = subprocess.run([LSOF, "-nP", "-a", "-p", str(a.pid), "-iTCP", "-sTCP:LISTEN", "-Fn"],
                        capture_output=True, text=True).stdout
    ports = [int(line.rsplit(":", 1)[1]) for line in ls.splitlines() if line.startswith("n") and ":" in line]
    if ports:
        try:
            bridge_call("from bl_ext.user_default.mcp import mcp_to_blender_server as s\ns.stop()\n"
                        "result = {'stopping': True}", "127.0.0.1", ports[0], timeout=30)
        except (OSError, ValueError):
            pass
        if gone(10):
            out({"ok": True, "pid": a.pid, "stopped_with": "bridge stop (clean exit)"})
    os.kill(a.pid, signal.SIGTERM)
    if gone(5):
        out({"ok": True, "pid": a.pid, "stopped_with": "SIGTERM"})
    fail("pid %d still running after a bridge stop and SIGTERM" % a.pid, 1)


# ---------------------------------------------------------------- setup and doctor

def sh(cmd, **kw):
    p = subprocess.run(cmd, capture_output=True, text=True, **kw)
    return p.returncode, (p.stdout + p.stderr).strip()


def addon_state(blender):
    code = ("import bpy,json;p=bpy.context.preferences;"
            "print('NB_STATE'+json.dumps({'addon_enabled': %r in p.addons, 'online_access': p.system.use_online_access}))"
            % ADDON_MODULE)
    _, txt = sh([blender, "-b", "--python-expr", code], timeout=120)
    for line in txt.splitlines():
        if line.startswith("NB_STATE"):
            return json.loads(line[len("NB_STATE"):])
    return {"error": txt[-400:]}


def cmd_setup_mcp(a):
    blender = find_blender()
    uv = find_tool("uv")
    if not uv:
        fail("uv not found (brew install uv)")
    log = []
    if not os.path.isdir(os.path.join(MCP_DIR, ".git")):
        log.append(sh(["git", "clone", "-q", MCP_REPO, MCP_DIR]))
    else:
        log.append(sh(["git", "-C", MCP_DIR, "fetch", "-q", "origin"]))
    rc, txt = sh(["git", "-C", MCP_DIR, "-c", "advice.detachedHead=false", "checkout", "-q", a.pin])
    if rc:
        fail("git checkout %s failed: %s" % (a.pin, txt))
    rc, txt = sh([uv, "sync", "--python", "3.12"], cwd=os.path.join(MCP_DIR, "mcp"), timeout=600)
    if rc:
        fail("uv sync failed: %s" % txt[-800:])
    build = os.path.join(MCP_DIR, "build")
    shutil.rmtree(build, ignore_errors=True)
    os.makedirs(build)
    rc, txt = sh([blender, "-b", "--factory-startup", "-c", "extension", "build", "--source-dir",
                  os.path.join(MCP_DIR, "addon", "blender_mcp_addon"), "--output-dir", build], timeout=300)
    zips = [f for f in os.listdir(build) if f.endswith(".zip")]
    if rc or not zips:
        fail("add-on build failed: %s" % txt[-800:])
    rc, txt = sh([blender, "-b", "-c", "extension", "install-file", "-r", "user_default", "-e",
                  os.path.join(build, zips[0])], timeout=300)
    if rc:
        fail("add-on install failed: %s" % txt[-800:])
    # The add-on refuses to open its socket unless Blender's "Allow Online Access" is on.
    rc, txt = sh([blender, "-b", "--python-expr",
                  "import bpy;bpy.context.preferences.system.use_online_access=True;bpy.ops.wm.save_userpref()"],
                 timeout=120)
    state = addon_state(blender)
    out({"ok": bool(state.get("addon_enabled") and state.get("online_access")), "pin": a.pin,
         "blender": blender_version(blender), "addon_zip": zips[0], **state,
         "server": os.path.join(MCP_DIR, "mcp", ".venv", "bin", "blender-mcp")}, 0 if state.get("addon_enabled") else 1)


def cmd_doctor(a):
    blender = find_blender()
    server = os.path.join(MCP_DIR, "mcp", ".venv", "bin", "blender-mcp")
    rc, head = sh(["git", "-C", MCP_DIR, "rev-parse", "HEAD"])
    report = {
        "blender": blender, "version": blender_version(blender),
        **addon_state(blender),
        "mcp_server": server if os.path.isfile(server) else None,
        "mcp_commit": head if rc == 0 else None,
        "mcp_pinned": rc == 0 and head == MCP_PIN,
        "gui_bridge_9876": port_open("127.0.0.1", 9876),
        "npx": find_tool("npx"), "ktx": find_tool("ktx"),
        "register_mcp": "claude mcp add --scope user blender -e BLENDER_PATH=%s -- %s" % (blender, server),
    }
    report["ok"] = bool(report.get("addon_enabled") and report.get("online_access") and report["mcp_server"])
    out(report, 0 if report["ok"] else 1)


# ---------------------------------------------------------------- argument parsing

def main():
    ap = argparse.ArgumentParser(prog="blendtool.py", description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("doctor", help="check Blender, the MCP add-on and server, npx, ktx").set_defaults(fn=cmd_doctor)
    p = sub.add_parser("setup-mcp", help="install or repair the official Blender MCP add-on and server")
    p.add_argument("--pin", default=MCP_PIN)
    p.set_defaults(fn=cmd_setup_mcp)

    p = sub.add_parser("inspect", help="objects, tris, materials, dimensions, bounding boxes as JSON")
    p.add_argument("file")
    p.add_argument("--deep", action="store_true")
    p.set_defaults(fn=cmd_inspect)

    p = sub.add_parser("convert", help="import any supported file, export by the output extension")
    p.add_argument("input")
    p.add_argument("output")
    p.set_defaults(fn=cmd_convert)

    p = sub.add_parser("render", help="preview PNG with auto-framed camera; several views make a sheet")
    p.add_argument("input")
    p.add_argument("output")
    p.add_argument("--views", default="iso")
    p.add_argument("--engine", choices=["workbench", "eevee", "cycles"], default="workbench")
    p.add_argument("--size", type=int, default=768)
    p.add_argument("--samples", type=int, default=64)
    p.set_defaults(fn=cmd_render)

    p = sub.add_parser("cleanup", help="weld, decimate, normals, transforms, size, origin, textures")
    p.add_argument("input")
    p.add_argument("output")
    add_cleanup_flags(p)
    p.set_defaults(fn=cmd_cleanup)

    p = sub.add_parser("roblox", help="Roblox-ready mesh: 1 unit = 1 stud, Z forward / Y up FBX, tri budget")
    p.add_argument("input")
    p.add_argument("output")
    add_cleanup_flags(p, roblox=True)
    p.set_defaults(fn=cmd_roblox)

    p = sub.add_parser("web", help="GLB for three.js, then gltf-transform optimize + validate")
    p.add_argument("input")
    p.add_argument("output")
    add_cleanup_flags(p)
    p.add_argument("--compress", choices=["meshopt", "draco", "quantize", "none"], default="meshopt")
    p.add_argument("--texture-compress", choices=["webp", "ktx2", "avif", "auto", "none"], default="webp")
    p.add_argument("--texture-size", type=int, default=2048)
    p.add_argument("--no-simplify", action="store_true", help="skip meshoptimizer simplification")
    p.add_argument("--keep-nodes", action="store_true",
                   help="keep the node tree and named meshes (needed when code finds objects by name)")
    p.set_defaults(fn=cmd_web)

    p = sub.add_parser("run", help="run a Python script inside headless Blender")
    p.add_argument("script")
    p.add_argument("script_args", nargs="*", help="after --, passed to the script as sys.argv[1:]")
    p.add_argument("--input", action="append", default=[], help="import this file first (repeatable)")
    p.add_argument("--blend", help="open this .blend as the scene (never overwritten)")
    p.add_argument("--out", help="export the result by extension (.glb .fbx .obj .usd .stl .ply .blend)")
    p.add_argument("--preset", choices=["default", "roblox", "web"], default="default")
    p.add_argument("--save-blend", help="save the resulting scene as a new .blend")
    p.add_argument("--prefs", action="store_true", help="load user prefs and add-ons (no --factory-startup)")
    p.add_argument("--no-report", action="store_true")
    p.add_argument("--timeout", type=int, default=1800)
    p.set_defaults(fn=cmd_run)

    p = sub.add_parser("serve", help="start a headless Blender MCP bridge on a free port")
    p.add_argument("--port", type=int, default=0)
    p.add_argument("--blend")
    p.add_argument("--wait", type=int, default=60)
    p.set_defaults(fn=cmd_serve)

    p = sub.add_parser("live", help="run Python in a live Blender through the MCP add-on socket")
    p.add_argument("code", nargs="?")
    p.add_argument("--file")
    p.add_argument("--host", default=os.environ.get("BLENDER_MCP_HOST", "127.0.0.1"))
    p.add_argument("--port", type=int, default=int(os.environ.get("BLENDER_MCP_PORT", "9876")))
    p.add_argument("--timeout", type=float, default=300.0)
    p.set_defaults(fn=cmd_live)

    p = sub.add_parser("stop", help="stop a headless bridge that serve started (checks the pid first)")
    p.add_argument("--pid", type=int, required=True)
    p.set_defaults(fn=cmd_stop)

    # Split off script args at the first `--` ourselves: argparse before Python 3.12 drops or
    # rejects `-- --flag` inside a subcommand (macOS /usr/bin/python3 is 3.9).
    argv, extra = sys.argv[1:], []
    if "--" in argv:
        cut = argv.index("--")
        argv, extra = argv[:cut], argv[cut + 1:]
    a = ap.parse_args(argv)
    if extra:
        if a.cmd != "run":
            fail("arguments after -- are only for `run`")
        a.script_args = (a.script_args or []) + extra
    a.fn(a)


if __name__ == "__main__":
    main()
