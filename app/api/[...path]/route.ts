import {
  withAiUser,
  chatGPTStatus,
  beginChatGPT,
  finishChatGPT,
  changeChatGPT,
  chatGPTModels,
} from "@/lib/chatgpt";
import { recoveryCode, recoveryHash } from "@/lib/auth";
import { searchContext } from "@/lib/retrieval";
import { enqueue, userJobs, kickJobs } from "@/lib/jobs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { db, getWorkspace, mutate } from "@/lib/db";
import {
  user,
  session,
  logout,
  passwordHash,
  passwordMatches,
} from "@/lib/auth";
import {
  documentContext,
  retrieveContext,
  summarizedContext,
  storedPath,
} from "@/lib/documents";
import {
  ai,
  generateCourse,
  generateQuestions,
  grade,
  questionSchema,
  systemPrompt,
  validateSources,
} from "@/lib/ai";
import { adaptiveDifficulty, updateMastery, xpFor } from "@/lib/learning";
import type { Exam, Question, Workspace } from "@/lib/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function limit(key: string, max = 15) {
  const r = await (
    await db()
  ).query(
    `INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,now()+interval '10 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.count+1 END,expires_at=CASE WHEN rate_limits.expires_at<now() THEN now()+interval '10 minutes' ELSE rate_limits.expires_at END RETURNING count`,
    [key],
  );
  if (r.rows[0].count > max)
    throw new Error(
      "Zu viele Anfragen. Bitte in zehn Minuten erneut versuchen.",
    );
}
const text = (v: unknown, max = 20000) =>
  z.string().trim().min(1).max(max).parse(v);
const json = (v: any, status = 200) =>
  NextResponse.json(v, { status, headers: { "Cache-Control": "no-store" } });
function safeQuestion(q: Question) {
  const { answer, explanation, ...publicQuestion } = q;
  if (
    ["matching", "connecting"].includes(q.type) &&
    q.options.every((v) => v.includes("→"))
  ) {
    const pairs = q.options.map((v) => v.split("→").map((s) => s.trim()));
    return {
      ...publicQuestion,
      options: [],
      matching: {
        terms: pairs.map((p) => p[0]),
        definitions: pairs
          .map((p) => p.slice(1).join("→"))
          .sort((a, b) => a.localeCompare(b)),
      },
    };
  }
  return publicQuestion;
}
function publicState(w: Workspace) {
  return {
    ...w,
    courses: w.courses.map((c) => ({
      ...c,
      chapters: c.chapters.map((ch) => ({
        ...ch,
        questions: ch.questions.map(safeQuestion),
      })),
    })),
    documents: w.documents.map(({ pages, ...d }) => ({
      ...d,
      pageCount: pages.length,
    })),
    exams: w.exams.map((e) => ({
      ...e,
      questions: e.questions.map((q) =>
        e.status === "completed" ? q : safeQuestion(q),
      ),
    })),
  };
}
function findChapter(w: Workspace, courseId: string, chapterId: string) {
  const course = w.courses.find((c) => c.id === courseId);
  const chapter = course?.chapters.find((c) => c.id === chapterId);
  if (!course || !chapter) throw new Error("Kapitel nicht gefunden.");
  return { course, chapter };
}
async function handle(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  try {
    const route = (await ctx.params).path.join("/");
    if (req.method !== "GET") {
      const origin = req.headers.get("origin");
      const requestURL = new URL(req.url);
      const expectedOrigin =
        process.env.APP_ORIGIN ||
        requestURL.protocol +
          "//" +
          (req.headers.get("host") || requestURL.host);
      if (origin && origin !== expectedOrigin)
        return json({ error: "Ungültiger Ursprung." }, 403);
    }
    if (route === "health" && req.method === "GET") {
      await (await db()).query("SELECT 1");
      return json({
        status: "ok",
        database: process.env.DATABASE_URL ? "postgresql" : "pglite",
        aiConfigured: Boolean(process.env.OPENAI_API_KEY),
      });
    }
    if (route === "chatgpt/callback" && req.method === "GET") {
      const origin = await finishChatGPT(new URL(req.url));
      return NextResponse.redirect(origin + "/?chatgpt=connected");
    }
    if (route === "auth/me") {
      const u = await user();
      return json({
        user: u,
        aiConfigured:
          Boolean(process.env.OPENAI_API_KEY) ||
          Boolean(u && (await chatGPTStatus(u.id)).connected),
      });
    }
    if (route === "auth/logout" && req.method === "POST") {
      await logout();
      return json({ ok: true });
    }
    if (route === "auth/reset" && req.method === "POST") {
      await limit("recovery:" + req.headers.get("x-forwarded-for"), 5);
      const body = await req.json();
      const email = z.email().parse(body.email).toLowerCase();
      const password = z.string().min(10).max(128).parse(body.password);
      const code = z.string().min(16).max(100).parse(body.code);
      const next = recoveryCode();
      const r = await (
        await db()
      ).query(
        `WITH changed AS (UPDATE users SET password=$1,recovery_hash=$2 WHERE email=$3 AND recovery_hash=$4 RETURNING id),revoked AS (DELETE FROM sessions WHERE user_id IN(SELECT id FROM changed)) SELECT id FROM changed`,
        [passwordHash(password), recoveryHash(next), email, recoveryHash(code)],
      );
      if (!r.rows.length)
        return json(
          { error: "E-Mail oder Wiederherstellungscode ist ungültig." },
          400,
        );
      return json({ ok: true, recoveryCode: next });
    }
    if (
      (route === "auth/register" || route === "auth/login") &&
      req.method === "POST"
    ) {
      await limit("auth:" + req.headers.get("x-forwarded-for"));
      const body = await req.json();
      const email = z.email().max(254).parse(body.email).toLowerCase();
      const password = z.string().min(10).max(128).parse(body.password);
      const conn = await db();
      if (route === "auth/register") {
        const id = crypto.randomUUID();
        const code = recoveryCode();
        try {
          await conn.query(
            "INSERT INTO users(id,email,password,recovery_hash) VALUES($1,$2,$3,$4)",
            [id, email, passwordHash(password), recoveryHash(code)],
          );
        } catch (e: any) {
          if (e.code === "23505")
            return json(
              {
                error:
                  "Registrierung nicht möglich. Bitte Anmeldung versuchen.",
              },
              409,
            );
          throw e;
        }
        await session(id);
        if (body.name)
          await mutate(id, (w) => {
            w.preferences.name = text(body.name, 80);
          });
        return json({ ok: true, recoveryCode: code });
      }
      const r = await conn.query(
        "SELECT id,password FROM users WHERE email=$1",
        [email],
      );
      if (!r.rows[0] || !passwordMatches(password, r.rows[0].password))
        return json({ error: "E-Mail oder Passwort ist falsch." }, 401);
      await session(r.rows[0].id);
      return json({ ok: true });
    }
    const u = await user();
    if (!u) return json({ error: "Bitte zuerst anmelden." }, 401);
    const uid = u.id;
    if (route === "chatgpt/status" && req.method === "GET")
      return json(await chatGPTStatus(uid));
    if (route === "chatgpt/models" && req.method === "GET")
      return json({ models: await chatGPTModels(uid) });
    if (route === "chatgpt/start" && req.method === "POST") {
      await limit("chatgpt:" + uid, 15);
      const body = await req.json();
      return json({
        url: await beginChatGPT(
          uid,
          new URL(req.url).origin,
          body.id ? text(body.id, 200) : undefined,
        ),
      });
    }
    if (route === "chatgpt/manage" && req.method === "POST") {
      const body = await req.json();
      return json(
        await changeChatGPT(
          uid,
          text(body.action, 30),
          body.id ? text(body.id, 200) : undefined,
        ),
      );
    }
    let w = await getWorkspace(uid);
    if (route === "state" && req.method === "GET") {
      kickJobs();
      return json({ ...publicState(w), jobs: await userJobs(uid) });
    }
    if (
      req.method === "GET" &&
      !["state", "document", "question", "export"].includes(route)
    )
      return json({ error: "Methode nicht erlaubt." }, 405);
    if (route === "upload") {
      const form = await req.formData();
      const files = form.getAll("files") as File[];
      if (!files.length || files.length > 10)
        throw new Error("Bitte 1 bis 10 Dateien auswählen.");
      if (w.documents.length + files.length > 100)
        throw new Error("Maximal 100 Dokumente pro Konto.");
      const courseId = String(form.get("courseId") || "");
      if (courseId && !w.courses.some((c) => c.id === courseId))
        throw new Error("Kurs nicht gefunden.");
      for (const file of files) {
        if (
          !(file instanceof File) ||
          file.size > 25 * 1024 * 1024 ||
          file.size === 0 ||
          !/\.(pdf|docx|pptx|txt|png|jpg|jpeg)$/i.test(file.name)
        )
          throw new Error(
            "Erlaubt: PDF, DOCX, PPTX, TXT, PNG und JPG, maximal 25 MB pro Datei.",
          );
      }
      const batchId = crypto.randomUUID();
      const newCourseId = crypto.randomUUID();
      const uploaded = [];
      for (const file of files) {
        const id = crypto.randomUUID();
        const target = storedPath(uid, id);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, Buffer.from(await file.arrayBuffer()));
        await mutate(uid, (w) => {
          w.documents.push({
            id,
            batchId,
            name: file.name,
            originalName: file.name,
            mime: file.type,
            size: file.size,
            status: "queued",
            progress: 0,
            pages: [],
            createdAt: new Date().toISOString(),
            ...(courseId ? { courseId } : {}),
          });
        });
        uploaded.push(id);
      }
      await enqueue(
        uid,
        "ingest",
        { documentIds: uploaded, courseId: courseId || undefined, newCourseId },
        "ingest:" + uid + ":" + batchId,
      );
      return json({ ids: uploaded });
    }
    if (route === "document") {
      const id = req.nextUrl.searchParams.get("id") || "";
      const d = w.documents.find((d) => d.id === id);
      if (!d) return json({ error: "Dokument nicht gefunden." }, 404);
      if (req.method === "DELETE") {
        await mutate(uid, (w) => {
          w.documents = w.documents.filter((d) => d.id !== id);
          for (const c of w.courses)
            c.documentIds = c.documentIds.filter((x) => x !== id);
        });
        await (
          await db()
        ).query(
          "DELETE FROM content_chunks WHERE user_id=$1 AND document_id=$2",
          [uid, id],
        );
        await fs.unlink(storedPath(uid, id)).catch(() => {});
        return json({ ok: true });
      }
      if (req.method === "PATCH") {
        const body = await req.json();
        await mutate(uid, (w) => {
          const d = w.documents.find((d) => d.id === id)!;
          d.name = text(body.name, 180);
        });
        return json({ ok: true });
      }
      if (req.nextUrl.searchParams.get("download"))
        return new NextResponse(
          new Uint8Array(await fs.readFile(storedPath(uid, id))),
          {
            headers: {
              "Content-Type": "application/octet-stream",
              "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(d.originalName)}`,
              "X-Content-Type-Options": "nosniff",
            },
          },
        );
      return json(d);
    }
    if (route === "question" && req.method === "GET") {
      const { chapter } = findChapter(
        w,
        req.nextUrl.searchParams.get("courseId") || "",
        req.nextUrl.searchParams.get("chapterId") || "",
      );
      const question = chapter.questions.find(
        (q) => q.id === req.nextUrl.searchParams.get("id"),
      );
      if (!question) throw new Error("Aufgabe fehlt.");
      return json(question);
    }
    const body = req.method === "GET" ? {} : await req.json();
    if (route === "auth/recovery") {
      await limit("recovery-user:" + uid, 5);
      const password = z.string().min(10).max(128).parse(body.password);
      const r = await (
        await db()
      ).query("SELECT password FROM users WHERE id=$1", [uid]);
      if (!passwordMatches(password, r.rows[0].password))
        return json({ error: "Das aktuelle Passwort ist falsch." }, 401);
      const code = recoveryCode();
      await (
        await db()
      ).query("UPDATE users SET recovery_hash=$1 WHERE id=$2", [
        recoveryHash(code),
        uid,
      ]);
      return json({ recoveryCode: code });
    }
    if (route === "retry") {
      const id = text(body.id, 100);
      if (!w.documents.some((d) => d.id === id))
        throw new Error("Dokument nicht gefunden.");
      const doc = w.documents.find((d) => d.id === id)!;
      const ids = w.documents
        .filter(
          (d) => (d.batchId === doc.batchId && doc.batchId) || d.id === id,
        )
        .map((d) => d.id);
      await enqueue(
        uid,
        "ingest",
        {
          documentIds: ids,
          courseId: doc.courseId,
          newCourseId: crypto.randomUUID(),
        },
        "ingest:" + uid + ":" + (doc.batchId || id),
      );
      return json({ ok: true });
    }
    if (route === "checkpoint") {
      const checkpoint = z
        .object({
          courseId: z.string(),
          chapterId: z.string(),
          tab: z.enum(["explain", "practice", "notes"]),
          view: z.string(),
          qIndex: z.number().int().min(0),
          answer: z.string().max(20000).optional(),
          questionId: z.string().optional(),
          requestId: z.uuid().optional(),
          method: z.string().max(40).optional(),
          difficulty: z.string().max(40).optional(),
          count: z.number().int().min(1).max(50).optional(),
          phase: z.number().int().min(0).max(5).optional(),
          scope: z.enum(["chapter", "course", "selected"]).optional(),
          selectedChapters: z.array(z.string()).max(100).optional(),
          onlyErrors: z.boolean().optional(),
        })
        .parse(body);
      await mutate(uid, (w) => {
        w.checkpoint = checkpoint;
      });
      return json({ ok: true });
    }
    if (route === "course/regenerate") {
      await limit("ai:" + uid, 60);
      const course = w.courses.find((c) => c.id === body.id);
      if (!course) throw new Error("Kurs fehlt.");
      const context = await summarizedContext(w, course.documentIds);
      if (context.length > 170000)
        throw new Error(
          "Für eine gemeinsame Neustrukturierung sind diese Unterlagen zu umfangreich. Bitte kleinere Dokumentgruppen verwenden.",
        );
      const generated = await generateCourse(
        context,
        w.preferences.language,
        w.preferences.difficulty,
      );
      for (const ch of generated.chapters) {
        validateSources(ch.sources, w.documents);
        for (const q of ch.questions) validateSources(q.sources, w.documents);
      }
      await mutate(uid, (w) => {
        const c = w.courses.find((c) => c.id === body.id);
        if (!c) return;
        c.title = generated.title;
        c.description = generated.description;
        c.chapters = generated.chapters.map((ch) => ({
          ...ch,
          id: crypto.randomUUID(),
          questions: ch.questions.map((q) => ({
            ...q,
            id: crypto.randomUUID(),
          })),
        }));
      });
      return json({ ok: true });
    }
    if (route === "preferences") {
      const p = z
        .object({
          name: z.string().max(80),
          language: z.enum(["de", "en"]),
          theme: z.enum(["light", "dark"]),
          difficulty: z.string().max(40),
          dailyGoal: z.number().int().min(10).max(1000),
          thresholds: z.array(z.number().min(1).max(99)).length(3),
        })
        .parse(body);
      if (!(
        p.thresholds[0] < p.thresholds[1] && p.thresholds[1] < p.thresholds[2]
      ))
        throw new Error("Grenzwerte müssen aufsteigend sein.");
      await mutate(uid, (w) => {
        w.preferences = p;
      });
      return json({ ok: true });
    }
    if (route === "note") {
      findChapter(w, body.courseId, body.chapterId);
      await mutate(uid, (w) => {
        w.notes[body.chapterId] = z.string().max(30000).parse(body.content);
      });
      return json({ ok: true });
    }
    if (route === "course") {
      const course = w.courses.find((c) => c.id === body.id);
      if (!course) throw new Error("Kurs nicht gefunden.");
      if (req.method === "DELETE") {
        await mutate(uid, (w) => {
          w.courses = w.courses.filter((c) => c.id !== body.id);
        });
        return json({ ok: true });
      }
      await mutate(uid, (w) => {
        const c = w.courses.find((c) => c.id === body.id)!;
        if (body.title) c.title = text(body.title, 150);
        if (body.chapters) {
          const ids = z.array(z.string()).parse(body.chapters);
          if (
            ids.length !== c.chapters.length ||
            new Set(ids).size !== ids.length ||
            ids.some((id) => !c.chapters.find((ch) => ch.id === id))
          )
            throw new Error("Ungültige Kapitelreihenfolge.");
          c.chapters = ids.map((id) => c.chapters.find((ch) => ch.id === id)!);
        }
        if (body.chapterId) {
          const ch = c.chapters.find((ch) => ch.id === body.chapterId);
          if (!ch) throw new Error("Kapitel fehlt.");
          ch.title = text(body.chapterTitle, 150);
        }
      });
      return json({ ok: true });
    }
    if (route === "lesson/adapt") {
      await limit("ai:" + uid, 60);
      const { course, chapter } = findChapter(w, body.courseId, body.chapterId);
      const level = z
        .enum([
          "Sehr einfach",
          "Normal",
          "Fortgeschritten",
          "Universitätsniveau",
        ])
        .parse(body.level);
      const variantKey = level + ":" + w.preferences.language;
      if (chapter.variants?.[variantKey])
        return json(chapter.variants[variantKey]);
      const raw = JSON.parse(
        await ai(
          [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Adaptiere diese Lektion an das Erklärniveau ${level}, Sprache ${w.preferences.language}. JSON {introduction,explanation,example,definitions,summary,sources:[{documentId,page,quote}]}. Nutze präzise Begriffe und nachvollziehbare Schritt-für-Schritt-Beispiele, ausschließlich belegt aus diesen Quellen. Thema: ${chapter.title}\n${retrieveContext(w, course.documentIds, chapter.title)}`,
            },
          ],
          true,
        ),
      );
      const lesson = z
        .object({
          introduction: z.string(),
          explanation: z.string(),
          example: z.string(),
          definitions: z.string(),
          summary: z.string(),
          sources: z
            .array(
              z.object({
                documentId: z.string(),
                page: z.number(),
                quote: z.string(),
              }),
            )
            .min(1),
        })
        .parse(raw);
      validateSources(lesson.sources, w.documents);
      await mutate(uid, (w) => {
        const ch = findChapter(w, course.id, chapter.id).chapter;
        ch.variants ||= {};
        ch.variants[variantKey] = lesson;
      });
      return json(lesson);
    }
    if (route === "questions/generate") {
      await limit("ai:" + uid, 60);
      const { course, chapter } = findChapter(w, body.courseId, body.chapterId);
      const count = z.number().int().min(1).max(50).parse(body.count);
      const questions = await generateQuestions(
        chapter,
        count,
        text(body.method, 50),
        text(body.difficulty, 50),
        documentContext(w, course.documentIds).slice(0, 150000),
        w.preferences.language,
      );
      for (const q of questions) validateSources(q.sources, w.documents);
      await mutate(uid, (w) => {
        findChapter(w, course.id, chapter.id).chapter.questions.push(
          ...questions,
        );
      });
      return json({ questions: questions.map(safeQuestion) });
    }
    if (route === "question") {
      const { chapter } = findChapter(w, body.courseId, body.chapterId);
      if (req.method === "DELETE") {
        await mutate(uid, (w) => {
          const ch = findChapter(w, body.courseId, body.chapterId).chapter;
          ch.questions = ch.questions.filter((q) => q.id !== body.id);
        });
        return json({ ok: true });
      }
      const parsed = questionSchema.parse(body.question);
      validateSources(parsed.sources, w.documents);
      await mutate(uid, (w) => {
        const ch = findChapter(w, body.courseId, body.chapterId).chapter;
        const old = ch.questions.find((q) => q.id === body.id);
        if (old) Object.assign(old, parsed);
        else ch.questions.push({ ...parsed, id: crypto.randomUUID() });
      });
      return json({ ok: true });
    }
    if (route === "answer") {
      const { course, chapter } = findChapter(w, body.courseId, body.chapterId);
      const q = chapter.questions.find((q) => q.id === body.questionId);
      if (!q) throw new Error("Aufgabe nicht gefunden.");
      const answer = text(body.answer);
      const requestId = z.uuid().parse(body.requestId);
      const previous = w.attempts.find((a) => a.id === requestId);
      if (previous)
        return json({
          ...previous,
          mastery: w.mastery[chapter.id],
          sources: q.sources,
        });
      const result = await grade(q, answer);
      const seconds = z
        .number()
        .min(0)
        .max(3600)
        .parse(body.seconds || 0);
      const attempt = await mutate(uid, (w) => {
        const old = w.attempts.find((a) => a.id === requestId);
        if (old) return old;
        const rewarded = w.attempts.some(
          (a) =>
            a.questionId === q.id &&
            a.correct &&
            a.at.slice(0, 10) === new Date().toISOString().slice(0, 10),
        );
        const before = w.mastery[chapter.id];
        const mastery = rewarded
          ? before
          : updateMastery(before, result.correct, q.difficulty);
        const bonus =
          !rewarded &&
          mastery &&
          mastery.score >= w.preferences.thresholds[1] &&
          !(w.achievements || []).includes("chapter:" + chapter.id)
            ? 100
            : 0;
        if (bonus) {
          w.achievements ||= [];
          w.achievements.push("chapter:" + chapter.id);
        }
        const xp = rewarded ? 0 : xpFor(result.correct, q.difficulty) + bonus;
        const attempt = {
          id: requestId,
          questionId: q.id,
          chapterId: chapter.id,
          courseId: course.id,
          answer,
          ...result,
          xp,
          at: new Date().toISOString(),
          difficulty: q.difficulty,
          seconds,
        };
        w.attempts.push(attempt);
        if (mastery) w.mastery[chapter.id] = mastery;
        if (!rewarded) {
          w.questionMastery ||= {};
          w.questionMastery[q.id] = updateMastery(
            w.questionMastery[q.id],
            result.correct,
            q.difficulty,
          );
        }
        w.studySeconds += seconds;
        return attempt;
      });
      if (!attempt.correct && process.env.OPENAI_API_KEY)
        await enqueue(
          uid,
          "remediation",
          {
            courseId: course.id,
            chapterId: chapter.id,
            questionId: q.id,
            attemptId: attempt.id,
          },
          "remediation:" + attempt.id,
        );
      return json({
        ...attempt,
        mastery: (await getWorkspace(uid)).mastery[chapter.id],
        sources: q.sources,
      });
    }
    if (route === "chat") {
      await limit("ai:" + uid, 60);
      const course = w.courses.find((c) => c.id === body.courseId);
      if (!course) throw new Error("Bitte einen Kurs auswählen.");
      const message = text(body.message, 4000);
      const history = w.chats
        .filter((c) => c.courseId === course.id)
        .slice(-8)
        .map(({ role, content }) => ({ role, content }));
      const response = await ai(
        [
          {
            role: "system",
            content:
              systemPrompt +
              ` Niveau: ${w.preferences.difficulty}. Sprache: ${w.preferences.language}. Gib JSON {answer:string,sources:[{documentId,page,quote}]} zurück. Zitiere nur exakte Originalstellen; falls kein Beleg existiert, sources=[] und die Information ausdrücklich als nicht in den Unterlagen belegt kennzeichnen. Quellen:\n${(await searchContext(uid, course.documentIds, message)) || retrieveContext(w, course.documentIds, message)}`,
          },
          ...history,
          { role: "user", content: message },
        ],
        true,
      );
      const parsed = z
        .object({
          answer: z.string(),
          sources: z.array(
            z.object({
              documentId: z.string(),
              page: z.number(),
              quote: z.string(),
            }),
          ),
        })
        .parse(JSON.parse(response));
      validateSources(parsed.sources, w.documents);
      const groundedResponse =
        parsed.answer +
        (parsed.sources.length
          ? "\n\n" +
            parsed.sources
              .map(
                (source) =>
                  `[${w.documents.find((d) => d.id === source.documentId)?.name}, Seite / Folie ${source.page}]\n> ${source.quote}`,
              )
              .join("\n\n")
          : "\n\nHinweis: Für diese Antwort wurde keine belegbare Quellenstelle angegeben.");
      await mutate(uid, (w) => {
        w.chats.push(
          {
            role: "user",
            content: message,
            courseId: course.id,
            at: new Date().toISOString(),
          },
          {
            role: "assistant",
            content: groundedResponse,
            courseId: course.id,
            at: new Date().toISOString(),
          },
        );
        w.chats = w.chats.slice(-300);
      });
      return json({ content: groundedResponse });
    }
    if (route === "exam/create") {
      const course = w.courses.find((c) => c.id === body.courseId);
      if (!course) throw new Error("Kurs fehlt.");
      const ids = z.array(z.string()).min(1).parse(body.chapterIds);
      if (ids.some((id) => !course.chapters.some((c) => c.id === id)))
        throw new Error("Kapitel fehlt.");
      const count = z.number().int().min(1).max(50).parse(body.count);
      const types = z.array(z.string()).parse(body.types || []);
      const difficulty = z
        .number()
        .int()
        .min(0)
        .max(3)
        .parse(body.difficulty || 0);
      const pool = course.chapters
        .filter((c) => ids.includes(c.id))
        .flatMap((c) => c.questions)
        .filter(
          (q) =>
            (!types.length || types.includes(q.type)) &&
            (!difficulty || q.difficulty === difficulty),
        );
      if (pool.length < count)
        throw new Error(
          `Nur ${pool.length} passende Aufgaben verfügbar. Bitte zuerst weitere Aufgaben generieren oder die Filter anpassen.`,
        );
      const questions = [...pool]
        .sort(() => Math.random() - 0.5)
        .slice(0, count);
      const exam: Exam = {
        id: crypto.randomUUID(),
        title: course.title + " · Prüfung",
        courseId: course.id,
        chapterIds: ids,
        questions,
        answers: {},
        status: "active",
        startedAt: new Date().toISOString(),
        duration: z.number().int().min(1).max(180).parse(body.duration) * 60,
        pass: z.number().min(1).max(100).parse(body.pass),
        hints: !!body.hints,
      };
      await mutate(uid, (w) => {
        w.exams.push(exam);
      });
      return json({ id: exam.id });
    }
    if (route === "exam/save") {
      await mutate(uid, (w) => {
        const e = w.exams.find((e) => e.id === body.id);
        if (!e || e.status !== "active")
          throw new Error("Prüfung nicht aktiv.");
        if (Date.now() > new Date(e.startedAt).getTime() + e.duration * 1000)
          throw new Error("Zeit abgelaufen. Bitte Prüfung abgeben.");
        const answers = z
          .record(z.string(), z.string().max(20000))
          .parse(body.answers);
        for (const id of Object.keys(answers))
          if (!e.questions.some((q) => q.id === id))
            throw new Error("Ungültige Aufgabe.");
        e.answers = answers;
      });
      return json({ ok: true });
    }
    if (route === "exam/repeat") {
      const old = w.exams.find((e) => e.id === body.id);
      if (!old) throw new Error("Prüfung fehlt.");
      const exam = {
        ...old,
        id: crypto.randomUUID(),
        answers: {},
        results: undefined,
        status: "active" as const,
        startedAt: new Date().toISOString(),
        score: undefined,
        submittedAt: undefined,
      };
      await mutate(uid, (w) => {
        w.exams.push(exam);
      });
      return json({ id: exam.id });
    }
    if (route === "exam/submit") {
      const { submitExam } = await import("@/lib/exams");
      await submitExam(
        uid,
        text(body.id, 100),
        body.answers
          ? z.record(z.string(), z.string().max(20000)).parse(body.answers)
          : undefined,
      );
      return json({ ok: true });
    }
    if (route === "phase") {
      findChapter(w, body.courseId, body.chapterId);
      const phase = z.number().int().min(1).max(4).parse(body.phase);
      await mutate(uid, (w) => {
        w.phases ||= {};
        w.phases[body.chapterId] = Math.max(
          w.phases[body.chapterId] || 0,
          phase,
        );
      });
      return json({ ok: true });
    }
    if (route === "export")
      return json({
        exportedAt: new Date().toISOString(),
        attempts: w.attempts,
        exams: publicState(w).exams,
        mastery: w.mastery,
        studySeconds: w.studySeconds,
      });
    return json({ error: "Unbekannter Endpunkt." }, 404);
  } catch (e) {
    console.error(e instanceof Error ? e.message : "Request failed");
    return json(
      {
        error:
          e instanceof z.ZodError
            ? "Ungültige Eingabe. Bitte Felder und Werte prüfen."
            : e instanceof Error
              ? e.message
              : "Ein unerwarteter Fehler ist aufgetreten.",
      },
      400,
    );
  }
}
async function dispatch(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  try {
    const account = await user();
    return await withAiUser(account?.id, () => handle(req, ctx));
  } catch {
    return json(
      { error: "Dienst ist derzeit nicht verfügbar. Bitte erneut versuchen." },
      503,
    );
  }
}
export const GET = dispatch;
export const POST = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
