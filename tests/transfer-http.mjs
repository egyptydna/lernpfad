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
function coursePayload(documentId, title = "Kostenloser Importkurs") {
  const sources = [{ documentId, page: 1, quote: fixture }];
  return {
    format: "lernpfad-course-v1",
    course: {
      title,
      description: "Ein Kurs ohne API-Zugang.",
      chapters: [
        {
          title: "Bilanz verstehen",
          introduction: fixture,
          explanation: fixture,
          example: fixture,
          definitions: fixture,
          summary: fixture,
          sources,
          questions: Array.from({ length: 3 }, (_, i) => ({
            type: "single",
            prompt: "Was zeigt die Bilanz? " + i,
            options: ["Vermögen und Kapital", "Nur Umsatz"],
            answer: "Vermögen und Kapital",
            explanation: fixture,
            difficulty: 1,
            sources,
          })),
        },
      ],
    },
  };
}
try {
  await boot();
  await request("transfer/export", { documentIds: ["foreign"] }, 401);
  await request("auth/register", {
    name: "Transfer-Test",
    email: "transfer@example.test",
    password: "transfer-test-password",
  });
  const firstCookie = cookie;
  const form = new FormData();
  form.append(
    "files",
    new Blob([fixture], { type: "text/plain" }),
    "bilanz.txt",
  );
  const upload = await request("upload", form);
  const documentId = upload.ids[0];
  let state;
  for (let i = 0; i < 60; i++) {
    state = await request("state");
    if (state.documents[0]?.status === "error") break;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(state.documents[0].extractedAt);
  assert.ok(state.documents[0].error.includes("OPENAI_API_KEY"));
  const bundle = await request("transfer/export", {
    documentIds: [documentId],
    from: 1,
    to: 1,
  });
  assert.equal(bundle.documents[0].pages[0].text, fixture);
  assert.equal(bundle.format, "lernpfad-request-v1");
  const payload = coursePayload(documentId),
    imported = await request("transfer/import", payload);
  assert.equal(imported.created, true);
  assert.equal((await request("transfer/import", payload)).created, false);
  state = await request("state");
  const course = state.courses.find((c) => c.id === imported.courseId),
    chapter = course.chapters[0],
    question = chapter.questions[0];
  const answer = await request("answer", {
    courseId: course.id,
    chapterId: chapter.id,
    questionId: question.id,
    requestId: crypto.randomUUID(),
    answer: "Vermögen und Kapital",
    seconds: 4,
  });
  assert.equal(answer.correct, true);
  assert.ok(answer.xp > 0);
  await stop();
  await boot();
  state = await request("state");
  assert.ok(state.courses.some((c) => c.id === imported.courseId));
  assert.ok(state.attempts.some((a) => a.questionId === question.id));
  assert.equal((await request("auth/me")).aiConfigured, false);
  await request("auth/register", {
    name: "Other",
    email: "transfer-other@example.test",
    password: "transfer-other-password",
  });
  await request("transfer/export", { documentIds: [documentId] }, 400);
  await request("transfer/import", payload, 400);
  assert.equal((await request("state")).courses.length, 0);
  cookie = firstCookie;
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
      page.setDefaultTimeout(120000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await page.locator("h1").waitFor();
      await page.getByRole("button", { name: "Menü", exact: true }).click();
      await page
        .getByRole("button", { name: "Meine Dokumente", exact: true })
        .click();
      await page.getByRole("checkbox", { name: "bilanz.txt" }).check();
      const downloading = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "1. Lernauftrag exportieren" })
        .click();
      const download = await downloading;
      assert.equal(download.suggestedFilename(), "ChatGPT-Lernauftrag.json");
      const downloaded = JSON.parse(
        await readFile(await download.path(), "utf8"),
      );
      assert.equal(downloaded.documents[0].documentId, documentId);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page
        .locator('input[type=file][accept=".json,application/json"]')
        .setInputFiles({
          name: "lernpfad-kurs.json",
          mimeType: "application/json",
          buffer: Buffer.from(
            JSON.stringify(coursePayload(documentId, "Browser-Importkurs")),
          ),
        });
      await page
        .getByText("Browser-Importkurs", { exact: true })
        .first()
        .waitFor();
      assert.deepEqual(errors, []);
      console.log(
        "PASS: mobile course export download, JSON import, course navigation and no page errors.",
      );
    } finally {
      await browser.close();
    }
  }
  console.log(
    "PASS: upload, text extraction, course export/import, idempotency, objective grading, XP, restart persistence and owner isolation with no API key.",
  );
} catch (e) {
  console.error(logs.slice(-4000));
  throw e;
} finally {
  await stop();
  await rm(dir, { recursive: true, force: true });
  await rm(dist, { recursive: true, force: true });
}
