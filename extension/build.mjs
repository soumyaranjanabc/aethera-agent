import { build, context } from "esbuild";
import { cpSync, rmSync, mkdirSync } from "node:fs";

const watch = process.argv.includes("--watch");

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("public", "dist", { recursive: true });

const common = {
  bundle: true,
  sourcemap: true,
  target: "chrome114",
  logLevel: "info",
  jsx: "automatic",
  minify: !watch,
  outdir: "dist",
  define: {
    "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production"),
  },
};

// Background = ES module (manifest sets "type": "module").
// Content script + side panel = IIFE (content scripts cannot be ES modules).
const targets = [
  { entryPoints: { background: "src/background/index.ts" }, format: "esm" },
  { entryPoints: { content: "src/content/index.ts" }, format: "iife" },
  { entryPoints: { sidepanel: "src/sidepanel/main.tsx" }, format: "iife" },
];

if (watch) {
  for (const t of targets) {
    const ctx = await context({ ...common, ...t });
    await ctx.watch();
  }
  console.log("Watching for changes... (click reload in chrome://extensions after rebuilds)");
} else {
  await Promise.all(targets.map((t) => build({ ...common, ...t })));
  console.log("Build complete -> dist/");
}