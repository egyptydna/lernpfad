// Full HTTP flow with a deterministic local OpenAI-compatible test provider.
// No test responses are included in application runtime.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
let generatedVariant = 0;
const fixture = "Die Bilanz zeigt Vermögen und Kapital.";
const dir = await mkdtemp(path.join(tmpdir(), "lernpfad-e2e-"));
const mock = createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  const body = JSON.parse(raw);
  const prompt = body.messages.at(-1).content;
  let response;
  if (
    typeof prompt === "string" &&
    prompt.includes("Erstelle einen systematischen Lernkurs")
  ) {
    const id = prompt.match(/documentId=([^,\]]+)/)?.[1];
    const source = { documentId: id, page: 1, quote: fixture };
    const qs = Array.from({ length: 6 }, (_, i) => ({
      type: i === 5 ? "open" : "single",
      prompt: "Was zeigt die Bilanz? Variante " + i,
      options: ["Vermögen und Kapital", "Nur Umsatz"],
      answer: "Vermögen und Kapital",
      explanation:
        "Die Bilanz zeigt Vermögen und Kapital, nicht nur den Umsatz.",
      difficulty: 1,
      sources: [source],
    }));
    response = JSON.stringify({
      title: "Grundlagen der Bilanz",
      description: "Aus den bereitgestellten Unterlagen.",
      chapters: [
        {
          title: "Die Bilanz verstehen",
          introduction: "Ein Überblick.",
          explanation: fixture,
          example: fixture,
          definitions: "Bilanz: " + fixture,
          summary: fixture,
          sources: [source],
          questions: qs,
        },
      ],
    });
  } else if (
    typeof prompt === "string" &&
    prompt.includes("Adaptiere diese Lektion")
  ) {
    const id = prompt.match(/documentId=([^,\]]+)/)?.[1];
    response = JSON.stringify({
      introduction: fixture,
      explanation: fixture,
      example: fixture,
      definitions: fixture,
      summary: fixture,
      sources: [{ documentId: id, page: 1, quote: fixture }],
    });
  } else if (typeof prompt === "string" && prompt.includes("Generiere genau")) {
    const id = prompt.match(/documentId=([^,\]]+)/)?.[1];
    const count = Number(prompt.match(/Generiere genau (\d+)/)?.[1] || 1);
    response = JSON.stringify({
      questions: Array.from({ length: count }, () => ({
        type: "single",
        prompt: "Neue Verständnisvariante " + ++generatedVariant,
        options: ["Vermögen und Kapital", "Nur Umsatz"],
        answer: "Vermögen und Kapital",
        explanation: fixture,
        difficulty: 1,
        sources: [{ documentId: id, page: 1, quote: fixture }],
      })),
    });
  } else if (
    typeof prompt === "string" &&
    prompt.includes("Bewerte semantisch")
  )
    response = JSON.stringify({
      correct: prompt.includes("Vermögen"),
      feedback: fixture,
    });
  else if (body.messages[0].content.includes("Gib JSON {answer")) {
    const id = body.messages[0].content.match(/documentId=([^,\]]+)/)?.[1];
    response = JSON.stringify({
      answer: fixture,
      sources: [{ documentId: id, page: 1, quote: fixture }],
    });
  } else response = fixture;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      choices: [{ message: { content: response }, finish_reason: "stop" }],
    }),
  );
});
await new Promise((r) => mock.listen(0, "127.0.0.1", r));
const mockPort = mock.address().port;
const probe = createServer();
await new Promise((r) => probe.listen(0, "127.0.0.1", r));
const testPort = probe.address().port;
await new Promise((r) => probe.close(r));
let child;
let worker;
let output = "";
let cookie = "";
const base = "http://127.0.0.1:" + testPort;
async function boot() {
  child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      process.env.TEST_PRODUCTION === "true" ? "start" : "dev",
      "--port",
      String(testPort),
      "--hostname",
      "127.0.0.1",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NEXT_DIST_DIR:
          process.env.TEST_PRODUCTION === "true"
            ? process.env.TEST_PRODUCTION_DIR || ".next"
            : ".next-integration-" + process.pid,
        DATA_DIR: dir,
        CHATGPT_LOCAL: "true",
        OPENAI_API_KEY: "integration-test-only",
        OPENAI_BASE_URL: "http://127.0.0.1:" + mockPort,
        NEXT_TELEMETRY_DISABLED: "1",
        EXTERNAL_WORKER:
          process.env.TEST_EXTERNAL_WORKER === "true" ? "true" : "false",
        APP_ORIGIN: "",
        JOB_LEASE_SECONDS: "3",
      },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  output = "";
  child.stdout.on("data", (c) => (output += c));
  child.stderr.on("data", (c) => (output += c));
  for (let i = 0; i < 90; i++) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error("Testserver beendet: " + output.slice(-4000));
    try {
      const r = await fetch(base + "/api/auth/me", {
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Server not ready: " + output.slice(-3000));
}
async function stop() {
  if (child && child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
    await once(child, "exit").catch(() => {});
    child = null;
  }
}
async function request(route, body, method = "POST", expected = 200) {
  const res = await fetch(base + "/api/" + route, {
    method: body === undefined ? "GET" : method,
    headers: {
      Origin: base,
      ...(cookie ? { cookie } : {}),
      ...(body === undefined || body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const json = await res.json();
  assert.equal(res.status, expected, JSON.stringify(json));
  if (res.headers.get("set-cookie"))
    cookie = res.headers.get("set-cookie").split(";")[0];
  return json;
}
try {
  if (process.env.TEST_EXTERNAL_WORKER === "true") {
    worker = spawn(process.execPath, ["--import", "tsx", "scripts/worker.ts"], {
      env: {
        ...process.env,
        DATA_DIR: dir,
        CHATGPT_LOCAL: "true",
        EXTERNAL_WORKER: "true",
        OPENAI_API_KEY: "integration-test-only",
        OPENAI_BASE_URL: "http://127.0.0.1:" + mockPort,
        JOB_LEASE_SECONDS: "3",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    worker.stderr.on("data", (c) => (output += c));
  }
  console.log("Integration: Server starten");
  await boot();
  await request("state", undefined, "GET", 401);
  await request("chatgpt/status", undefined, "GET", 401);
  for (const origin of [
    "http://foreign.example",
    "https://127.0.0.1:" + testPort,
  ]) {
    const r = await fetch(base + "/api/auth/register", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "blocked@example.test",
        password: "not-created-password",
      }),
    });
    assert.equal(
      r.status,
      403,
      "cross-origin and cross-scheme requests must fail",
    );
  }

  await request("auth/register", {
    name: "Test",
    email: "first@example.test",
    password: "persistent-password-123",
  });
  const firstCookie = cookie;
  const connection = await request("chatgpt/status", undefined, "GET");
  assert.equal(connection.enabled, true);
  assert.equal(connection.connected, false);
  const authorization = new URL((await request("chatgpt/start", {})).url);
  assert.equal(authorization.origin, "https://auth.openai.com");
  assert.equal(
    authorization.searchParams.get("client_id"),
    "dynamic_agent_client",
  );
  assert.equal(
    authorization.searchParams.get("redirect_uri"),
    base + "/api/chatgpt/callback",
  );
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.ok(
    authorization.searchParams
      .get("scope")
      .includes("chatgpt.tokens.use.direct"),
  );
  const badCallback = await fetch(
    base + "/api/chatgpt/callback?state=invalid&code=invalid",
  );
  assert.equal(badCallback.status, 400);
  console.log(
    "Integration: lokale ChatGPT-Anmeldung und Zugriffsschutz geprüft",
  );
  const form = new FormData();
  form.append(
    "files",
    new Blob([fixture], { type: "text/plain" }),
    "bilanz.txt",
  );
  form.append(
    "files",
    new Blob([fixture + " Zweite Quelle."], { type: "text/plain" }),
    "zweite-quelle.txt",
  );
  console.log("Integration: Upload und Wiederaufnahme");
  const uploaded = await request("upload", form);
  await stop();
  await boot(); // pending queued/leased ingest must survive restart without a state request

  let state;
  for (let i = 0; i < 90; i++) {
    const doc = await request("document?id=" + uploaded.ids[0]);
    state = { documents: [doc] };
    if (state.documents[0]?.status === "ready") break;
    if (state.documents[0]?.status === "error")
      throw new Error(state.documents[0].error);
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.equal(state.documents[0].status, "ready");
  state = await request("state");
  assert.equal(state.documents.length, 2);
  assert.equal(
    state.courses[0].documentIds.length,
    2,
    "multi-file upload must create one linked course",
  );
  assert.equal(state.courses.length, 1);
  const course = state.courses[0],
    chapter = course.chapters[0],
    q = chapter.questions[0];
  assert.equal(q.answer, undefined, "learning response must not leak solution");
  const id = crypto.randomUUID();
  const result = await request("answer", {
    courseId: course.id,
    chapterId: chapter.id,
    questionId: q.id,
    answer: "Vermögen und Kapital",
    seconds: 15,
    requestId: id,
  });
  assert.equal(result.correct, true);
  assert.equal(result.xp, 10);
  await request("answer", {
    courseId: course.id,
    chapterId: chapter.id,
    questionId: q.id,
    answer: "Vermögen und Kapital",
    seconds: 15,
    requestId: id,
  });
  assert.equal(
    (await request("state")).attempts.length,
    1,
    "retry must be idempotent",
  );
  await request("checkpoint", {
    courseId: course.id,
    chapterId: chapter.id,
    tab: "practice",
    view: "dashboard",
    qIndex: 0,
    answer: "Entwurf",
    questionId: q.id,
    requestId: crypto.randomUUID(),
    method: "single",
    difficulty: "2",
    count: 7,
    phase: 2,
    scope: "selected",
    selectedChapters: [chapter.id],
    onlyErrors: false,
  });
  await request("note", {
    courseId: course.id,
    chapterId: chapter.id,
    content: "Dauerhafte Notiz",
  });
  await request("lesson/adapt", {
    courseId: course.id,
    chapterId: chapter.id,
    level: "Sehr einfach",
  });
  assert.equal(
    (await request("state")).courses[0].chapters[0].variants["Sehr einfach:de"]
      .explanation,
    fixture,
  );
  const created = await request("exam/create", {
    courseId: course.id,
    chapterIds: [chapter.id],
    count: 3,
    duration: 20,
    pass: 60,
    hints: false,
  });
  state = await request("state");
  const exam = state.exams[0];
  assert.equal(exam.questions[0].answer, undefined);
  const answers = Object.fromEntries(
    exam.questions.map((q) => [q.id, "Vermögen und Kapital"]),
  );
  await request("exam/save", { id: created.id, answers });
  const chat = await request("chat", {
    courseId: course.id,
    message: "Was zeigt die Bilanz?",
  });
  assert.ok(chat.content.includes("Vermögen"));
  // User isolation applies to reads, writes and original files.
  cookie = "";
  const secondAccount = await request("auth/register", {
    name: "Other",
    email: "second@example.test",
    password: "another-password-456",
  });
  await request("document?id=" + uploaded.ids[0], undefined, "GET", 404);
  await request(
    "answer",
    {
      courseId: course.id,
      chapterId: chapter.id,
      questionId: q.id,
      answer: "x",
      requestId: crypto.randomUUID(),
      seconds: 1,
    },
    "POST",
    400,
  );
  assert.equal((await request("state")).courses.length, 0);
  assert.ok(secondAccount.recoveryCode);
  await request(
    "auth/reset",
    {
      email: "second@example.test",
      password: "reset-password-789",
      code: "NOT-A-REAL-RECOVERY-CODE",
    },
    "POST",
    400,
  );
  const reset = await request("auth/reset", {
    email: "second@example.test",
    password: "reset-password-789",
    code: secondAccount.recoveryCode,
  });
  assert.notEqual(reset.recoveryCode, secondAccount.recoveryCode);
  await request("state", undefined, "GET", 401);
  await request("chatgpt/status", undefined, "GET", 401);
  await request("auth/login", {
    email: "second@example.test",
    password: "reset-password-789",
  });
  await request(
    "auth/reset",
    {
      email: "second@example.test",
      password: "invalid-new-password",
      code: secondAccount.recoveryCode,
    },
    "POST",
    400,
  );

  cookie = firstCookie;
  await stop();
  await boot();
  state = await request("state");
  assert.equal(state.notes[chapter.id], "Dauerhafte Notiz");
  assert.equal(state.checkpoint.count, 7);
  assert.equal(state.checkpoint.answer, "Entwurf");
  assert.equal(state.checkpoint.scope, "selected");
  assert.equal(state.attempts.length, 1);
  assert.deepEqual(state.exams[0].answers, answers);
  assert.equal(state.documents[0].status, "ready");
  const original = await fetch(
    base + "/api/document?id=" + uploaded.ids[0] + "&download=1",
    { headers: { cookie } },
  );
  assert.equal(await original.text(), fixture);
  await request("exam/submit", { id: created.id, answers });
  state = await request("state");
  assert.equal(state.exams[0].score, 100);
  assert.equal(state.exams[0].status, "completed");
  const attemptCount = state.attempts.length;
  await request("exam/submit", { id: created.id, answers });
  assert.equal((await request("state")).attempts.length, attemptCount);
  await request("phase", {
    courseId: course.id,
    chapterId: chapter.id,
    phase: 3,
  });
  assert.ok((await request("state")).phases[chapter.id] >= 3);
  const repeated = await request("exam/repeat", { id: created.id });
  assert.notEqual(repeated.id, created.id);
  assert.equal(
    (await request("state")).exams.find((e) => e.id === repeated.id).status,
    "active",
  );
  const wrongQ = chapter.questions[1];
  const wrong = await request("answer", {
    courseId: course.id,
    chapterId: chapter.id,
    questionId: wrongQ.id,
    answer: "Nur Umsatz",
    requestId: crypto.randomUUID(),
    seconds: 4,
  });
  assert.equal(wrong.correct, false);
  let remediation;
  for (let i = 0; i < 40; i++) {
    const s = await request("state");
    remediation = s.attempts.find((a) => a.id === wrong.id);
    if (remediation.followUpId) break;
    if (remediation.remediationError)
      throw new Error(remediation.remediationError);
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(
    remediation.followUpId,
    "wrong answer must generate a persisted new question",
  );
  console.log("Integration: API-Prüfungen abgeschlossen");
  if (process.env.BROWSER_QA === "true") {
    const { default: browserQA } = await import("./browser.cjs");
    await browserQA({
      base,
      cookie,
      courseId: course.id,
      chapterId: chapter.id,
      documentId: uploaded.ids[0],
    });
  }
  console.log(
    "PASS: registration, authentication, TXT upload, AI course generation, source validation, server grading, idempotency, notes, exam autosave, tutor, owner isolation, process restart persistence, original download, exam scoring and repeat submit.",
  );
} catch (e) {
  console.error(output.slice(-5000));
  throw e;
} finally {
  await stop();
  if (worker && worker.exitCode === null) {
    worker.kill("SIGTERM");
    await once(worker, "exit");
  }
  mock.close();
  await rm(dir, { recursive: true, force: true });
}
