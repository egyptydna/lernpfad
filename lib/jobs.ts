import { withAiUser } from "./chatgpt";
import { db } from "./db";
import { randomUUID } from "node:crypto";
export type JobPayload = {
  documentIds?: string[];
  courseId?: string;
  newCourseId?: string;
  questionId?: string;
  chapterId?: string;
  attemptId?: string;
  examId?: string;
};
export async function enqueue(
  userId: string,
  kind: "ingest" | "remediation" | "exam",
  payload: JobPayload,
  id: string = randomUUID(),
) {
  const conn = await db();
  await conn.query(
    `INSERT INTO jobs(id,user_id,kind,payload,status) VALUES($1,$2,$3,$4::jsonb,'queued') ON CONFLICT(id) DO UPDATE SET status=CASE WHEN jobs.status='failed' THEN 'queued' ELSE jobs.status END,attempts=CASE WHEN jobs.status='failed' THEN 0 ELSE jobs.attempts END,error=NULL`,
    [id, userId, kind, JSON.stringify(payload)],
  );
  kickJobs();
  return id;
}
const state = globalThis as unknown as {
  learnWorker?: NodeJS.Timeout;
  learnWorking?: boolean;
  learnSweep?: number;
};
export function kickJobs() {
  if (process.env.EXTERNAL_WORKER === "true") return;
  startWorker();
  void runNextJob();
}
export function startWorker(force = false) {
  if (state.learnWorker || (!force && process.env.EXTERNAL_WORKER === "true"))
    return;
  state.learnWorker = setInterval(() => void runNextJob(), 2000);
  state.learnWorker.unref();
  void runNextJob();
}
export async function runNextJob() {
  if (state.learnWorking) return;
  state.learnWorking = true;
  let job: any;
  const owner = randomUUID();
  let heartbeat: NodeJS.Timeout | undefined;
  try {
    const conn = await db();
    const lease = Math.max(3, Number(process.env.JOB_LEASE_SECONDS) || 240);
    if (Date.now() - (state.learnSweep || 0) > 30000) {
      state.learnSweep = Date.now();
      const rows = await conn.query(
        `SELECT user_id,data->'exams' AS exams,data->'documents' AS documents FROM workspaces`,
      );
      for (const row of rows.rows) {
        const pending = (row.documents || []).filter(
          (d: any) => d.status === "queued" || d.status === "processing",
        );
        const batches = new Set(pending.map((d: any) => d.batchId || d.id));
        for (const batch of batches) {
          const docs = pending.filter(
            (d: any) => (d.batchId || d.id) === batch,
          );
          await enqueue(
            row.user_id,
            "ingest",
            {
              documentIds: docs.map((d: any) => d.id),
              courseId: docs[0].courseId,
              newCourseId: String(batch),
            },
            "ingest:" + row.user_id + ":" + batch,
          );
        }
        for (const exam of row.exams || [])
          if (
            exam.status === "active" &&
            Date.now() >
              new Date(exam.startedAt).getTime() + exam.duration * 1000
          )
            await enqueue(
              row.user_id,
              "exam",
              { examId: exam.id },
              "exam:" + exam.id,
            );
      }
    }
    const claim = await conn.query(
      `UPDATE jobs SET status='running',owner=$1,lease_until=now()+($2::int * interval '1 second'),attempts=attempts+1 WHERE id=(SELECT id FROM jobs WHERE (status='queued' OR (status='running' AND lease_until<now())) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
      [owner, lease],
    );
    job = claim.rows[0];
    if (!job) return;
    heartbeat = setInterval(
      () => {
        void conn
          .query(
            `UPDATE jobs SET lease_until=now()+($3::int * interval '1 second') WHERE id=$1 AND owner=$2`,
            [job.id, owner, lease],
          )
          .catch(() => {});
      },
      Math.min(30000, lease * 300),
    );
    heartbeat.unref();
    await withAiUser(job.user_id, async () => {
      if (job.kind === "ingest") {
        const { processBatch } = await import("./documents");
        await processBatch(
          job.user_id,
          job.payload.documentIds || [],
          job.payload.courseId,
          job.payload.newCourseId,
        );
      } else if (job.kind === "remediation") {
        const { createRemediation } = await import("./remediation");
        await createRemediation(job.user_id, job.payload);
      } else if (job.kind === "exam") {
        const { submitExam } = await import("./exams");
        await submitExam(job.user_id, job.payload.examId);
      } else throw new Error("Unbekannter Auftragstyp.");
    });
    await conn.query(
      `UPDATE jobs SET status='completed',finished_at=now(),lease_until=NULL WHERE id=$1 AND owner=$2`,
      [job.id, owner],
    );
  } catch (e) {
    if (job) {
      const message =
        e instanceof Error ? e.message : "Verarbeitung fehlgeschlagen";
      await (
        await db()
      )
        .query(
          `UPDATE jobs SET status='failed',error=$3,finished_at=now(),lease_until=NULL WHERE id=$1 AND owner=$2`,
          [job.id, owner, message],
        )
        .catch(() => {});
    } else console.error("Hintergrundverarbeitung nicht verfügbar.");
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    state.learnWorking = false;
  }
}
export async function userJobs(userId: string) {
  const r = await (
    await db()
  ).query(
    `SELECT id,kind,status,error,created_at,finished_at FROM jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30`,
    [userId],
  );
  return r.rows;
}
