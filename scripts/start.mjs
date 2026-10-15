import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
async function run(command, args) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  const [code] = await once(child, "exit");
  if (code !== 0) process.exit(code || 1);
}
try {
  await access("node_modules/next/package.json");
  await access("node_modules/jose/package.json");
} catch {
  await run(npm, ["ci"]);
}
await run(process.execPath, ["scripts/setup.mjs"]);
await run(process.execPath, [
  "node_modules/next/dist/bin/next",
  "dev",
  "--hostname",
  "127.0.0.1",
]);
