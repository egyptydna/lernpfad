import { getWorkspace, mutate } from "./db";
import { grade } from "./ai";
import { updateMastery, xpFor } from "./learning";
export async function submitExam(
  userId: string,
  id: string,
  incoming?: Record<string, string>,
) {
  const w = await getWorkspace(userId);
  const exam = w.exams.find((e) => e.id === id);
  if (!exam) throw new Error("Prüfung fehlt.");
  if (exam.status === "completed") return;
  const expired =
    Date.now() > new Date(exam.startedAt).getTime() + exam.duration * 1000;
  const answers = expired ? exam.answers : incoming || exam.answers;
  const results: { questionId: string; correct: boolean; feedback: string }[] =
    [];
  for (const q of exam.questions) {
    const answer = answers[q.id] || "";
    results.push({
      questionId: q.id,
      ...(answer.trim()
        ? await grade(q, answer)
        : {
            correct: false,
            feedback:
              "Nicht beantwortet. " +
              q.explanation +
              " Musterlösung: " +
              q.answer,
          }),
    });
  }
  await mutate(userId, (w) => {
    const e = w.exams.find((e) => e.id === id);
    if (!e || e.status === "completed") return;
    e.answers = answers;
    e.results = results;
    e.status = "completed";
    e.score = Math.round(
      (results.filter((r) => r.correct).length / results.length) * 100,
    );
    e.submittedAt = new Date().toISOString();
    const course = w.courses.find((c) => c.id === e.courseId);
    for (let i = 0; i < results.length; i++) {
      const r = results[i],
        q = e.questions.find((q) => q.id === r.questionId)!;
      const ch = course?.chapters.find((ch) =>
        ch.questions.some((q) => q.id === r.questionId),
      );
      if (!ch) continue;
      w.attempts.push({
        id: crypto.randomUUID(),
        questionId: q.id,
        chapterId: ch.id,
        courseId: e.courseId,
        answer: answers[q.id] || "",
        correct: r.correct,
        feedback: r.feedback,
        xp:
          xpFor(r.correct, q.difficulty) +
          (e.score === 100 && i === 0 ? 50 : 0),
        at: e.submittedAt,
        difficulty: q.difficulty,
        examId: id,
        seconds: 0,
      });
      w.questionMastery ||= {};
      w.questionMastery[q.id] = updateMastery(
        w.questionMastery[q.id],
        r.correct,
        q.difficulty,
      );
      w.mastery[ch.id] = updateMastery(
        w.mastery[ch.id],
        r.correct,
        q.difficulty,
      );
    }
    w.achievements ||= [];
    if (e.score === 100 && !w.achievements.includes("perfect-exam"))
      w.achievements.push("perfect-exam");
    if (e.score >= e.pass) {
      for (const chapterId of e.chapterIds) {
        const ch = course?.chapters.find((ch) => ch.id === chapterId);
        if (
          ch &&
          e.questions.filter((q) => ch.questions.some((p) => p.id === q.id))
            .length >= Math.min(5, ch.questions.length)
        ) {
          w.phases ||= {};
          w.phases[chapterId] = 5;
        }
      }
    }
    w.studySeconds += Math.min(
      e.duration,
      (Date.now() - new Date(e.startedAt).getTime()) / 1000,
    );
  });
}
