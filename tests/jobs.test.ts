import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { db, mutate, getWorkspace } from "../lib/db";
import { runNextJob } from "../lib/jobs";
test("expired exams are submitted by the worker without a browser and stale job leases are reclaimed idempotently", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "lernpfad-jobs-"));
  process.env.DATA_DIR = dir;
  process.env.EXTERNAL_WORKER = "true";
  const userId = crypto.randomUUID();
  let connection: any;
  try {
    connection = await db();
    await connection.query(
      "INSERT INTO users(id,email,password) VALUES($1,$2,$3)",
      [userId, "worker@example.test", "test-only"],
    );
    const q = {
      id: "q",
      type: "single",
      prompt: "Welche Antwort?",
      options: ["A", "B"],
      answer: "A",
      explanation: "A ist richtig.",
      difficulty: 1,
      sources: [],
    };
    await mutate(userId, (w) => {
      w.courses.push({
        id: "c",
        title: "Testkurs",
        description: "Test",
        documentIds: [],
        createdAt: new Date().toISOString(),
        color: "violet",
        chapters: [
          {
            id: "ch",
            title: "Test",
            introduction: "",
            explanation: "",
            example: "",
            definitions: "",
            summary: "",
            sources: [],
            questions: [q],
          },
        ],
      });
      w.exams.push({
        id: "e",
        title: "Testprüfung",
        courseId: "c",
        chapterIds: ["ch"],
        questions: [q],
        answers: { q: "A" },
        status: "active",
        startedAt: new Date(Date.now() - 120000).toISOString(),
        duration: 60,
        pass: 60,
        hints: false,
      });
    });
    await runNextJob();
    let w = await getWorkspace(userId);
    assert.equal(w.exams[0].status, "completed");
    assert.equal(w.exams[0].score, 100);
    const count = w.attempts.length;
    await connection.query(
      `INSERT INTO jobs(id,user_id,kind,payload,status,owner,lease_until) VALUES('orphan',$1,'exam',$2::jsonb,'running','dead-worker',now()-interval '1 second')`,
      [userId, JSON.stringify({ examId: "e" })],
    );
    await runNextJob();
    const row = await connection.query(
      "SELECT status,owner FROM jobs WHERE id='orphan'",
    );
    assert.equal(row.rows[0].status, "completed");
    assert.notEqual(row.rows[0].owner, "dead-worker");
    w = await getWorkspace(userId);
    assert.equal(w.attempts.length, count);
  } finally {
    await connection?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
