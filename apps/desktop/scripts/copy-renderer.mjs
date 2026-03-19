import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, "..");
const repoRoot = resolve(desktopRoot, "..", "..");
const rendererOutDir = join(repoRoot, "apps", "renderer", "out");
const desktopRendererDir = join(desktopRoot, "dist", "renderer");

if (!existsSync(rendererOutDir)) {
  throw new Error(`Renderer export not found at ${rendererOutDir}. Run renderer build first.`);
}

mkdirSync(join(desktopRoot, "dist"), { recursive: true });
rmSync(desktopRendererDir, { recursive: true, force: true });
cpSync(rendererOutDir, desktopRendererDir, { recursive: true });

console.log(`Copied renderer export to ${desktopRendererDir}`);
