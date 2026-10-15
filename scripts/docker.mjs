import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
for (const [command, args] of [
  [process.execPath, ["scripts/setup.mjs"]],
  [
    "docker",
    ["compose", "--env-file", ".env.local", "up", "--build", "--detach"],
  ],
]) {
  const child = spawn(command, args, { stdio: "inherit" });
  const [code] = await once(child, "exit");
  if (code !== 0) process.exit(code || 1);
}
console.log(
  "Lernpfad mit PostgreSQL und Hintergrunddienst: http://localhost:3000",
);
