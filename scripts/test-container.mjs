import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const suffix = randomBytes(5).toString("hex"),
  network = "lernpfad-qa-" + suffix,
  pg = network + "-db",
  app = network + "-app",
  worker = network + "-worker",
  volume = network + "-files";
const pass = randomBytes(24).toString("hex");
const env = { ...process.env };
for (const k of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[k];
const created = [];
let net = false,
  vol = false;
function docker(args, variables = {}) {
  const r = spawnSync(
    "docker",
    ["--host=unix:///var/run/docker.sock", ...args],
    { env: { ...env, ...variables }, encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(r.stderr || "Docker fehlgeschlagen");
  return r.stdout.trim();
}
try {
  docker(["network", "create", network]);
  net = true;
  docker(["volume", "create", volume]);
  vol = true;
  docker(
    [
      "run",
      "--detach",
      "--name",
      pg,
      "--network",
      network,
      "--network-alias",
      "db",
      "--env",
      "POSTGRES_PASSWORD",
      "--env",
      "POSTGRES_DB=lernpfad",
      "postgres:17-alpine",
    ],
    { POSTGRES_PASSWORD: pass },
  );
  created.push(pg);
  for (let i = 0; i < 45; i++) {
    try {
      docker(["exec", pg, "pg_isready", "-U", "postgres"]);
      break;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  const variables = {
    DATABASE_URL: `postgresql://postgres:${pass}@db:5432/lernpfad`,
  };
  const shared = [
    "--network",
    network,
    "--mount",
    `type=volume,src=${volume},dst=/app/.data`,
    "--env",
    "DATABASE_URL",
    "--env",
    "EXTERNAL_WORKER=true",
  ];
  docker(
    [
      "run",
      "--detach",
      "--name",
      worker,
      "--no-healthcheck",
      ...shared,
      "lernpfad:validated",
      "npm",
      "run",
      "worker",
    ],
    variables,
  );
  created.push(worker);
  docker(
    [
      "run",
      "--detach",
      "--name",
      app,
      ...shared,
      "--env",
      "COOKIE_SECURE=false",
      "--publish",
      "127.0.0.1::3000",
      "lernpfad:validated",
    ],
    variables,
  );
  created.push(app);
  let base = "http://127.0.0.1:" + docker(["port", app, "3000/tcp"]).split(":").at(-1);
  async function ready() {
    for (let i = 0; i < 90; i++) {
      try {
        const r = await fetch(base + "/api/health", {
          signal: AbortSignal.timeout(3000),
        });
        if (r.ok) {
          assert.equal((await r.json()).database, "postgresql");
          return;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error("Container nicht bereit.");
  }
  await ready();
  let cookie = "";
  async function request(route, data) {
    const r = await fetch(base + "/api/" + route, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        Origin: base,
        ...(cookie ? { cookie } : {}),
        ...(data === undefined || data instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body:
        data === undefined
          ? undefined
          : data instanceof FormData
            ? data
            : JSON.stringify(data),
    });
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    const body = await r.json();
    assert.equal(r.status, 200, JSON.stringify(body));
    return body;
  }
  const registration = await request("auth/register", {
    email: "container@example.test",
    password: "container-test-password",
    name: "Container-Test",
  });
  const form = new FormData();
  form.append(
    "files",
    new Blob(["Eine dauerhaft gespeicherte Unterlage."], {
      type: "text/plain",
    }),
    "container.txt",
  );
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents 4 0 R >>",
    "<< /Length 0 >>\nstream\n\nendstream",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const start = Buffer.byteLength(pdf);
  pdf +=
    "xref\n0 5\n0000000000 65535 f \n" +
    offsets.map((n) => String(n).padStart(10, "0") + " 00000 n \n").join("") +
    `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  form.append(
    "files",
    new Blob([pdf], { type: "application/pdf" }),
    "scan.pdf",
  );
  const upload = await request("upload", form);
  let state;
  for (let i = 0; i < 45; i++) {
    state = await request("state");
    if (state.documents[0]?.status === "error") break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.equal(state.documents[0].status, "error");
  assert.ok(
    state.documents[0].error.includes("OPENAI_API_KEY"),
    "real missing-key error must be reported by the separate container worker",
  );
  const pdfDoc = state.documents.find((d) => d.originalName === "scan.pdf");
  assert.ok(
    pdfDoc && pdfDoc.error.includes("OPENAI_API_KEY"),
    "native PDF rendering in the container must reach the actual vision configuration check",
  );
  docker(["restart", app]);
  base = "http://127.0.0.1:" + docker(["port", app, "3000/tcp"]).split(":").at(-1);
  await ready();
  state = await request("state");
  assert.equal(state.documents.length, 2);
  const original = await fetch(
    base + "/api/document?id=" + upload.ids[0] + "&download=1",
    { headers: { cookie } },
  );
  assert.equal(await original.text(), "Eine dauerhaft gespeicherte Unterlage.");
  const recovered = await request("auth/reset", {
    email: "container@example.test",
    password: "reset-container-password",
    code: registration.recoveryCode,
  });
  assert.notEqual(recovered.recoveryCode, registration.recoveryCode);
  const revoked = await fetch(base + "/api/state", { headers: { cookie } });
  assert.equal(revoked.status, 401);
  await request("auth/login", {
    email: "container@example.test",
    password: "reset-container-password",
  });
  assert.equal((await request("state")).documents.length, 2);
  if (process.env.BROWSER_QA === "true") {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
    const browser = await chromium.launch({
      executablePath: process.env.BROWSER_PATH || undefined,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    try {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      const split = cookie.indexOf("=");
      await context.addCookies([
        {
          name: cookie.slice(0, split),
          value: cookie.slice(split + 1),
          url: base,
        },
      ]);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await page.locator("h1").waitFor();
      await page.getByRole("button", { name: "Menü", exact: true }).click();
      await page
        .getByRole("button", { name: "Einstellungen", exact: true })
        .click();
      await page.getByLabel("Grundlagen (%)", { exact: true }).fill("90");
      await page
        .getByRole("button", { name: "Einstellungen speichern", exact: true })
        .click();
      await page.locator(".error-toast[role=alert]").waitFor();
      assert.ok(
        (await page.locator(".error-toast[role=alert]").innerText()).includes("aufsteigend"),
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      assert.deepEqual(errors, []);
      console.log(
        "PASS: mobile production container UI and visible error feedback.",
      );
    } finally {
      await browser.close();
    }
  }
  console.log(
    "PASS: production Docker app + PostgreSQL + separate Docker worker, simultaneous schema setup, authenticated upload, real configuration failure, container restart and persistent original file.",
  );
} catch (error) {
  console.error(error);
  for (const name of created) {
    try { console.error(name, docker(["logs", "--tail", "25", name])); } catch {}
  }
  throw error;
} finally {
  for (const name of created.reverse()) {
    try {
      docker(["rm", "--force", "--volumes", name]);
    } catch {}
  }
  if (vol)
    try {
      docker(["volume", "rm", volume]);
    } catch {}
  if (net)
    try {
      docker(["network", "rm", network]);
    } catch {}
}
