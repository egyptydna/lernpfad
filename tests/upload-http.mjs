import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "lernpfad-transfer-"));
const probe = createServer();
await new Promise((r) => probe.listen(0, "127.0.0.1", r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
const base = `http://127.0.0.1:${port}`,
  dist = ".next-transfer-" + process.pid,
  fixture = "Die Bilanz zeigt Vermögen und Kapital.";
let child,
  cookie = "",
  logs = "";
async function boot() {
  child = spawn(
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
        OPENAI_API_KEY: "",
        OPENAI_BASE_URL: "",
        COOKIE_SECURE: "false",
        EXTERNAL_WORKER: "false",
        CHATGPT_LOCAL: "false",
        CODESPACE_NAME: "",
        APP_ORIGIN: "",
        NEXT_DIST_DIR: dist,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", (c) => (logs += c));
  child.stderr.on("data", (c) => (logs += c));
  for (let i = 0; i < 90; i++) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(logs.slice(-2000));
    try {
      if (
        (
          await fetch(base + "/api/auth/me", {
            signal: AbortSignal.timeout(5000),
          })
        ).ok
      )
        return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Testserver nicht bereit: " + logs.slice(-2000));
}
async function stop() {
  if (child && child.exitCode === null && child.signalCode === null) {
    process.kill(-child.pid, "SIGTERM");
    await once(child, "exit");
  }
}
async function request(route, body, expected = 200) {
  const r = await fetch(base + "/api/" + route, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: base,
      ...(cookie ? { cookie } : {}),
      ...(body && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  const value = await r.json();
  assert.equal(r.status, expected, JSON.stringify(value));
  if (r.headers.get("set-cookie"))
    cookie = r.headers.get("set-cookie").split(";")[0];
  return value;
}
function largePDF() {
  const count = 106,
    objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      `<< /Type /Pages /Kids [${Array.from({ length: count }, (_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${count} >>`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
  for (let i = 0; i < count; i++) {
    const stream = `BT /F1 12 Tf 50 750 Td (Bilanz und Kapital Seite ${i + 1}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  }
  const padding = " ".repeat(20 * 1024 * 1024);
  objects.push(
    `<< /Length ${padding.length} >>\nstream\n${padding}\nendstream`,
  );
  let pdf = "%PDF-1.4\n",
    offsets = [];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = Buffer.byteLength(pdf);
  pdf +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((n) => String(n).padStart(10, "0") + " 00000 n \n").join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(pdf);
}
try {
  await boot();
  await request("auth/register", {
    name: "Upload-Test",
    email: "upload@example.test",
    password: "upload-test-password",
  });
  const owner = cookie,
    id = crypto.randomUUID(),
    bytes = largePDF();
  const chunkForm = (index) => {
    const form = new FormData();
    form.set("id", id);
    form.set("name", "106-folien.pdf");
    form.set("size", String(bytes.length));
    form.set("index", String(index));
    form.set(
      "chunk",
      new Blob([bytes.subarray(index * 1048576, (index + 1) * 1048576)]),
      "chunk.bin",
    );
    return form;
  };
  await request("upload/chunk", chunkForm(0));
  const finish = new FormData();
  finish.set("uploadIds", JSON.stringify([id]));
  await request("upload", finish, 400); // incomplete files must not become documents
  await request("auth/register", {
    name: "Other",
    email: "other@example.test",
    password: "upload-test-password",
  });
  await request("upload", finish, 400); // another account cannot assemble these chunks
  cookie = owner;
  await request("upload/chunk", chunkForm(0)); // retry must be safe
  for (let i = 1; i < Math.ceil(bytes.length / 1048576); i++)
    await request("upload/chunk", chunkForm(i));
  assert.deepEqual((await request("upload", finish)).ids, [id]);
  assert.deepEqual(
    await readFile(
      path.join(dir, "files", (await request("auth/me")).user.id, id),
    ),
    bytes,
  );
  assert.deepEqual((await request("upload", finish)).ids, [id]); // lost final response is safe
  let state;
  for (let i = 0; i < 120; i++) {
    state = await request("state");
    if (state.documents[0]?.extractedAt) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.equal(state.documents.length, 1);
  assert.equal(state.documents[0].pageCount, 106);
  assert.ok(state.documents[0].extractedAt);
  const bundle = await request("transfer/export", {
    documentIds: [id],
    from: 100,
    to: 106,
  });
  assert.equal(bundle.documents[0].pages.length, 7);
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
        viewport: { width: 1024, height: 768 },
        hasTouch: true,
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
      page.setDefaultTimeout(120000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base);
      await page.locator("h1").waitFor();
      await page
        .getByRole("button", { name: "Meine Dokumente", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Dokumente hochladen", exact: true })
        .click();
      await page
        .locator(".upload-modal input[type=file]")
        .setInputFiles({
          name: "browser-106-folien.pdf",
          mimeType: "application/pdf",
          buffer: bytes,
        });
      await page
        .locator(".upload-modal")
        .getByRole("button", { name: "Lernpfad erstellen", exact: true })
        .click();
      await page.locator(".upload-modal").waitFor({ state: "hidden" });
      await page
        .getByText("browser-106-folien.pdf", { exact: true })
        .first()
        .waitFor();
      assert.deepEqual(errors, []);
      console.log(
        "PASS: tablet touch viewport uploads the 20 MB PDF through the actual UI.",
      );
    } finally {
      await browser.close();
    }
  }
  console.log(
    "PASS: 20 MB / 106-page PDF chunk upload, retry, exact stored bytes, owner isolation, incomplete rejection, extraction and export of pages 100–106.",
  );
} catch (e) {
  console.error(logs.slice(-4000));
  throw e;
} finally {
  await stop();
  await rm(dir, { recursive: true, force: true });
  await rm(dist, { recursive: true, force: true });
}
