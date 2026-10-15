import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "lernpfad-origin-"));
const probe = createServer();
await new Promise((r) => probe.listen(0, "127.0.0.1", r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
const space = "origin-regression-example",
  publicOrigin = `https://${space}-3000.app.github.dev`,
  base = `http://127.0.0.1:${port}`;
const dist = ".next-origin-" + process.pid;
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    detached: true,
    env: {
      ...process.env,
      DATA_DIR: dir,
      DATABASE_URL: "",
      COOKIE_SECURE: "false",
      EXTERNAL_WORKER: "true",
      CHATGPT_LOCAL: "false",
      CODESPACE_NAME: space,
      APP_ORIGIN: publicOrigin,
      NEXT_DIST_DIR: dist,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
child.stdout.on("data", (c) => (logs += c));
child.stderr.on("data", (c) => (logs += c));
async function register(origin, forwardedHost, email) {
  return fetch(base + "/api/auth/register", {
    method: "POST",
    headers: {
      Origin: origin,
      "X-Forwarded-Host": forwardedHost,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Origin test",
      email,
      password: "new-password-for-test-only",
    }),
    signal: AbortSignal.timeout(60000),
  });
}
try {
  let ready = false;
  for (let i = 0; i < 90; i++) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(logs.slice(-2000));
    try {
      if (
        (
          await fetch(base + "/api/auth/me", {
            signal: AbortSignal.timeout(3000),
          })
        ).ok
      ) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.ok(ready, "test server must start");
  const accepted = await register(
    publicOrigin,
    `${space}-3000.app.github.dev`,
    "origin-public@example.test",
  );
  assert.equal(
    accepted.status,
    200,
    JSON.stringify(await accepted.clone().json()),
  );
  const cookie = accepted.headers.get("set-cookie").split(";")[0];
  const me = await fetch(base + "/api/auth/me", { headers: { cookie } });
  assert.equal((await me.json()).user.email, "origin-public@example.test");
  const rewritten = await register(
    "http://localhost:3000",
    `${space}-3000.app.github.dev`,
    "origin-rewritten@example.test",
  );
  assert.equal(
    rewritten.status,
    200,
    JSON.stringify(await rewritten.clone().json()),
  );
  const rejected = await register(
    "https://attacker.test",
    "attacker.test",
    "not-created@example.test",
  );
  assert.equal(rejected.status, 403);
  console.log(
    "PASS: real registration behind Codespaces forwarding, session cookie, proxy-rewritten origin and foreign-origin rejection.",
  );
} finally {
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
  if (child.exitCode === null && child.signalCode === null)
    await new Promise((r) => child.once("exit", r));
  await rm(dir, { recursive: true, force: true });
  await rm(dist, { recursive: true, force: true });
}
