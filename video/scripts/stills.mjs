/**
 * Render a set of frames as PNG stills from one bundle, for the critique loop (RULES.md section 6).
 *
 *   node scripts/stills.mjs 70 290 420            # frames -> out/stills/f0070.png ...
 *   node scripts/stills.mjs --scale 0.5 70 290    # smaller files
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
let scale = 1;
const frames = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--scale") scale = Number(args[++i]);
  else frames.push(Number(args[i]));
}
if (frames.length === 0) {
  console.error("usage: node scripts/stills.mjs [--scale 0.5] <frame> [<frame> ...]");
  process.exit(1);
}

const serveUrl = await bundle({ entryPoint: path.join(root, "src", "index.ts"), webpackOverride: (c) => c });
const composition = await selectComposition({ serveUrl, id: "Launch", chromiumOptions: { gl: "angle" } });
for (const frame of frames) {
  const output = path.join(root, "out", "stills", `f${String(frame).padStart(4, "0")}.png`);
  await renderStill({ composition, serveUrl, output, frame, scale, chromiumOptions: { gl: "angle" }, imageFormat: "png" });
  console.log(`${frame} -> ${path.relative(root, output)}`);
}
