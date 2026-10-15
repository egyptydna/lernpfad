import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, copyFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
function run(command, args, cwd = root) {
  const r = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.error || r.status !== 0)
    throw new Error("Befehl fehlgeschlagen: " + command);
}
const name = process.argv[2] || "lernpfad";
if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name))
  throw new Error("Bitte einen einfachen Repository-Namen verwenden.");
let checkout;
try {
  run("gh", ["auth", "status"]);
  checkout = await mkdtemp(path.join(tmpdir(), "lernpfad-publish-"));
  async function copy(directory, target) {
    await mkdir(target, { recursive: true });
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const n = item.name;
      if (
        ["node_modules", ".git", ".data", ".buildx"].includes(n) ||
        n.startsWith(".next") ||
        (n.startsWith(".env") && n !== ".env.example") ||
        n.endsWith(".tsbuildinfo") ||
        n.endsWith(".log") ||
        (directory === root && n.endsWith(".png"))
      )
        continue;
      if (item.isDirectory())
        await copy(path.join(directory, n), path.join(target, n));
      else if (item.isFile())
        await copyFile(path.join(directory, n), path.join(target, n));
    }
  }
  await copy(root, checkout);
  run("git", ["init", "-b", "main"], checkout);
  run("git", ["config", "user.name", "Lernpfad"], checkout);
  run(
    "git",
    ["config", "user.email", "lernpfad@users.noreply.github.com"],
    checkout,
  );
  run("git", ["add", "."], checkout);
  run(
    "git",
    [
      "commit",
      "-m",
      "Add Lernpfad learning platform with local ChatGPT connection",
    ],
    checkout,
  );
  // Create a new private repository. Existing repositories are never overwritten.
  run(
    "gh",
    ["repo", "create", name, "--private", "--source", checkout, "--push"],
    checkout,
  );
  console.log(
    "Quellcode privat auf GitHub veröffentlicht. GitHub Pages kann den Serverbetrieb dieser Anwendung nicht übernehmen.",
  );
} catch {
  console.error(
    "Veröffentlichung nicht abgeschlossen. GitHub CLI mit Repository-Schreibrechten verbinden und npm run github erneut ausführen. Bestehende Repositories werden nicht verändert.",
  );
  process.exitCode = 1;
} finally {
  if (checkout) await rm(checkout, { recursive: true, force: true });
}
