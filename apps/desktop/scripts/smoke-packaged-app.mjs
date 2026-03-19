import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, "..");
const productName = process.env.SCOPE_SMOKE_PRODUCT_NAME?.trim() || "Scope";
const appPath =
  process.env.SCOPE_SMOKE_APP_PATH?.trim() ||
  findDefaultAppPath(productName, [
    join(desktopRoot, "release", "mac-arm64", `${productName}.app`),
    join(desktopRoot, "release", "mac", `${productName}.app`),
    join(desktopRoot, "dist", "mac-arm64", `${productName}.app`),
    join(desktopRoot, "dist", "mac", `${productName}.app`)
  ]);

if (!appPath || !existsSync(appPath)) {
  throw new Error("Packaged app not found. Set SCOPE_SMOKE_APP_PATH to the .app bundle.");
}

const port = Number(process.env.SCOPE_SMOKE_PORT ?? "4310");
const binaryPath = join(appPath, "Contents", "MacOS", productName);
if (!existsSync(binaryPath)) {
  throw new Error(`App binary not found at ${binaryPath}`);
}

const child = spawn(binaryPath, [], {
  env: {
    ...process.env,
    SCOPE_LOCAL_SERVICE_PORT: String(port)
  },
  stdio: "ignore",
  detached: true
});

child.unref();

try {
  await waitForHealth(port, 60_000);
  console.log(`Smoke test passed for ${appPath} on port ${port}`);
} finally {
  try {
    process.kill(child.pid, "SIGTERM");
  } catch {
    // no-op
  }
}

function findDefaultAppPath(product, candidates) {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  console.log(`No default packaged app found for ${product}.`);
  return null;
}

async function waitForHealth(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "Service did not respond";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/health`);
      if (response.ok) {
        const payload = await response.json();
        if (payload?.ok === true) {
          return;
        }
      }
      lastError = `Unexpected health response: ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting for packaged app health check: ${lastError}`);
}
