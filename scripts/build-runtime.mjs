#!/usr/bin/env node
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Rebuild with a locally available Rolldown; no package is fetched or installed.
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--rolldown")) {
  throw new Error("Usage: node scripts/build-runtime.mjs [--rolldown /path/to/node_modules/rolldown]");
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let rolldown;
if (args.length) {
  const moduleRoot = resolve(args[1]);
  const pkg = JSON.parse(await readFile(resolve(moduleRoot, "package.json"), "utf8"));
  if (pkg.name !== "rolldown") throw new Error("--rolldown must point to the Rolldown package directory");
  rolldown = (await import(pathToFileURL(resolve(moduleRoot, pkg.module ?? pkg.main)).href)).rolldown;
} else {
  try {
    ({ rolldown } = await import("rolldown"));
  } catch (error) {
    throw new Error("Rolldown is unavailable. Pass --rolldown /path/to/an/existing/node_modules/rolldown (tested with 1.2.16).", { cause: error });
  }
}
const output = resolve(root, "skills/site-effects-demo-craft/assets/runtime/swarm-build.js");
const license = (await readFile(resolve(root, "runtime-src/LICENSE"), "utf8")).trim();
const banner = `/*!\nSwarmBuild standalone 2D runtime; IIFE global SwarmBuild.\nPorted from https://github.com/habom2310/swarm-build.\n\n${license.replaceAll("*/", "* /")}\n*/`;
await mkdir(dirname(output), { recursive: true });
const bundle = await rolldown({ input: resolve(root, "runtime-src/index.ts"), platform: "browser" });
try {
  await bundle.write({ file: output, format: "iife", name: "SwarmBuild", banner });
} finally {
  await bundle.close();
}
console.log(`Built ${output}`);
