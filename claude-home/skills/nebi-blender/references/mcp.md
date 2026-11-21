# Blender MCP: install, register, run

## Which server

The official Blender Lab server (`projects.blender.org/lab/blender_mcp`, GPL-3.0-or-later, by the Blender developers). It needs Blender 5.1 or newer, sends no telemetry, has no paid tier, and ships 26 tools, including manual and Python API search, window screenshots, and `*_for_cli` tools that open a `.blend` in a separate headless Blender without touching the open window.

Not the community `ahujasid/blender-mcp` (PyPI `blender-mcp`, now mcp-for-blender, MIT). It has telemetry on by default (`DISABLE_TELEMETRY=true` turns it off) and upsells a premium tier. `uvx blender-mcp` fetches that package, not the official one, which is not on PyPI.

## Install or repair

```
python3 ~/.claude/skills/nebi-blender/tools/blendtool.py setup-mcp
```

It clones the server to `~/.agents/nebi/blender-mcp`, checks out the pinned commit (`MCP_PIN` in `blendtool.py`), builds the venv with `uv sync --python 3.12`, builds the add-on with `blender -c extension build`, installs and enables it with `extension install-file -r user_default -e`, turns on Blender's online access (the add-on refuses to start without it) and saves the prefs. Re-running it is safe. `--pin <commit>` moves to another commit; review the upstream diff first.

Result: add-on module `bl_ext.user_default.mcp`, server at `~/.agents/nebi/blender-mcp/mcp/.venv/bin/blender-mcp`. The add-on autostarts a socket server on `localhost:9876` whenever the Blender window opens. Nothing has to be clicked.

## Register with Claude Code

```
claude-accounts mcp add -s user blender -e BLENDER_PATH=/Applications/Blender.app/Contents/MacOS/Blender -- $HOME/.agents/nebi/blender-mcp/mcp/.venv/bin/blender-mcp
```

Put the name before `-e`: `-e` takes several values and would swallow a name written after it. `claude-accounts` adds it to every account; plain `claude mcp add` with the same arguments adds it to one. `claude mcp get blender` should show it connected. Undo: `claude-accounts mcp remove blender -s user`.

Environment the server reads: `BLENDER_MCP_HOST` and `BLENDER_MCP_PORT` (default `localhost:9876`) pick the live Blender; `BLENDER_PATH` is the binary the `*_for_cli` tools start.

## Tools

Live (need a running Blender with the add-on): `execute_blender_code`, `get_objects_summary`, `get_object_detail_summary`, `get_blendfile_summary_*` (datablocks, missing_files, of_linked_libraries, path_info, usage_guess), `get_screenshot_of_window_as_image`, `get_screenshot_of_window_as_json`, `get_screenshot_of_area_as_image`, `jump_to_tab_by_name`, `jump_to_tab_by_space_type`, `jump_to_view3d_object_by_name`, `jump_to_view3d_object_data_by_name`, `render_thumbnail_to_path`, `render_viewport_to_path`.

Offline: `execute_blender_code_for_cli` and the `get_blendfile_summary_*_for_cli` tools run a headless Blender on a given file. `search_manual_docs`, `search_api_docs` and `get_python_api_docs` search the Blender docs.

`execute_blender_code` returns the dict the code assigns to `result`. Its sandbox only blocks quitting Blender and resetting prefs; everything else runs with full access.

## Without the window

`blendtool.py serve [--blend f.blend] [--port N]` starts `Blender -b --online-mode [f.blend] -c blender_mcp --port N` and prints its pid, port and log. Point the MCP server at it with `BLENDER_MCP_PORT=N`, or call `blendtool.py live --port N`. `blendtool.py stop --pid P` ends it cleanly. The background bridge answers one request at a time and has no window, so screenshot and jump tools do not apply.

## Socket protocol (what `live` sends)

One JSON object per connection, NUL-terminated: `{"type": "execute", "code": "...", "strict_json": false}`. The reply is JSON plus NUL: `{"status": "ok", "result": ...}` or `{"status": "error", "message": traceback}`.
