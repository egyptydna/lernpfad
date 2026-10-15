import { spawnSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
const env = { ...process.env };
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[key];
const name = "lernpfad-qa-" + randomBytes(5).toString("hex");
const password = randomBytes(24).toString("hex");
function docker(args, extra = {}) {
  const r = spawnSync(
    "docker",
    ["--host=unix:///var/run/docker.sock", ...args],
    { env: { ...env, ...extra }, encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(r.stderr || "Docker fehlgeschlagen");
  return r.stdout.trim();
}
let started = false;
try {
  docker(
    [
      "run",
      "--detach",
      "--rm",
      "--name",
      name,
      "--publish",
      "127.0.0.1::5432",
      "--env",
      "POSTGRES_PASSWORD",
      "--env",
      "POSTGRES_DB=lernpfad",
      "postgres:17-alpine",
    ],
    { POSTGRES_PASSWORD: password },
  );
  started = true;
  for (let i = 0; i < 45; i++) {
    try {
      docker(["exec", name, "pg_isready", "-U", "postgres"]);
      break;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  const port = docker(["port", name, "5432/tcp"]).split(":").at(-1);
  const child = spawn(process.execPath, ["tests/integration.mjs"], {
    env: {
      ...process.env,
      DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/lernpfad`,
      TEST_EXTERNAL_WORKER: "true",
    },
    stdio: "inherit",
  });
  const [code] = await once(child, "exit");
  if (code !== 0)
    throw new Error("PostgreSQL-Integrationstest fehlgeschlagen.");
  console.log("PASS: echter PostgreSQL-Server mit isoliertem Testcontainer.");
} finally {
  if (started) docker(["stop", name]);
}
