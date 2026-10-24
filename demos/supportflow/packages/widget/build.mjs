import { build } from "esbuild";
import { mkdirSync } from "node:fs";

// The API serves this file at /widget.js.
mkdirSync("../../apps/api/public", { recursive: true });
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020", "safari15"],
  outfile: "../../apps/api/public/widget.js",
  legalComments: "none",
  logLevel: "info",
});
