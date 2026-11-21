# Trigger evals — nebi-blender

Must fire (positives):
1. "Open my scene.blend headlessly and tell me how many triangles each object has."
2. "Convert this FBX the client sent into a GLB."
3. "This Higgsfield GLB is 250k verts. Clean it up and get it into Roblox as a prop."
4. "Script a low-poly street lamp in Blender and export it for the website."
5. "Render me a quick preview image of model.glb from the front and the side."
6. "Put the AI-generated statue on a pedestal I build by script and export the lot."
7. "The Blender MCP server won't connect. Fix it."
8. "My sub-agent only has Bash. Have it check crate.blend for floating parts and render a review sheet."

Must NOT fire (near-misses):
1. "Generate a Roblox sword from a text prompt and upload it." (roblox-3d-model)
2. "Lay out a Roblox obby map and check every jump is reachable." (roblox-map)
3. "Our GLB is already exported; switch it from Draco to meshopt and make the textures KTX2." (threejs-asset-pipeline)
4. "Load this GLB in the three.js scene with a progress bar." (threejs-loaders)
5. "Make a 3D model of a sneaker with Higgsfield." (higgsfield-generate)
6. "Write a GLSL dissolve shader for the hero mesh." (threejs-shaders)
7. "Bake the normal map from the high-poly sculpt onto the low-poly game mesh, with a cage." (blender-texture-baking)

How to run: from the source repository, `node claude-home/nebi/run-trigger-evals.mjs --headless --model <model> --skill nebi-blender --report /tmp/nebi-blender-triggers.json`. The runner stages the source pack without deployment. `--list` is an offline checklist; an unavailable CLI or ungradable run is an error, never a passing fallback.
PASS = the skill fires on every positive and none of the near-misses; a description edit that flips a row is a regression.
