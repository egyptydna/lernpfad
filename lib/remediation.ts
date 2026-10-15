import { getWorkspace, mutate } from "./db";
import { generateQuestions, validateSources } from "./ai";
import { retrieveContext } from "./documents";
import type { JobPayload } from "./jobs";
export async function createRemediation(userId: string, payload: JobPayload) {
  const w = await getWorkspace(userId);
  const course = w.courses.find((c) => c.id === payload.courseId);
  const chapter = course?.chapters.find((c) => c.id === payload.chapterId);
  const attempt = w.attempts.find((a) => a.id === payload.attemptId);
  if (!course || !chapter || !attempt || attempt.followUpId) return;
  const question = chapter.questions.find((q) => q.id === payload.questionId);
  if (!question) return;
  try {
    const qs = await generateQuestions(
      {
        ...chapter,
        title:
          chapter.title +
          " – Verständnis nach Fehler überprüfen: " +
          question.prompt +
          "; letzter Denkfehler: " +
          attempt.feedback,
      },
      1,
      question.type,
      String(Math.max(1, question.difficulty - 1)),
      retrieveContext(w, course.documentIds, question.prompt),
      w.preferences.language,
    );
    for (const q of qs) validateSources(q.sources, w.documents);
    await mutate(userId, (w) => {
      const a = w.attempts.find((a) => a.id === attempt.id);
      const ch = w.courses
        .find((c) => c.id === course.id)
        ?.chapters.find((c) => c.id === chapter.id);
      if (a && ch && !a.followUpId) {
        ch.questions.push(...qs);
        a.followUpId = qs[0].id;
      }
    });
  } catch (e) {
    await mutate(userId, (w) => {
      const a = w.attempts.find((a) => a.id === attempt.id);
      if (a)
        a.remediationError =
          e instanceof Error
            ? e.message
            : "Folgeaufgabe konnte nicht erstellt werden.";
    });
    throw e;
  }
}
