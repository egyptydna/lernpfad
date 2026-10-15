import test from "node:test";
import assert from "node:assert/strict";
import { emptyWorkspace } from "../lib/types";
import { exportForChatGPT, importChatGPTCourse } from "../lib/course-transfer";
import { grade } from "../lib/ai";
const quote = "Die Bilanz zeigt Vermögen und Kapital.";
function workspace() {
  const w = emptyWorkspace();
  w.documents.push({
    id: "doc-private",
    name: "Bilanz",
    originalName: "bilanz.txt",
    mime: "text/plain",
    size: quote.length,
    status: "error",
    error: "OPENAI_API_KEY fehlt",
    progress: 45,
    pages: [
      { page: 1, text: quote },
      { page: 2, text: "Zweite Seite." },
    ],
    createdAt: new Date().toISOString(),
    extractedAt: new Date().toISOString(),
  });
  return w;
}
function payload() {
  const source = { documentId: "doc-private", page: 1, quote };
  return {
    format: "lernpfad-course-v1",
    course: {
      title: "Bilanz verstehen",
      description: "Ein belegter Kurs.",
      chapters: [
        {
          title: "Grundlagen",
          introduction: quote,
          explanation: quote,
          example: quote,
          definitions: quote,
          summary: quote,
          sources: [source],
          questions: Array.from({ length: 3 }, (_, i) => ({
            type: "single",
            prompt: "Was zeigt die Bilanz? " + i,
            options: ["Vermögen und Kapital", "Nur Umsatz"],
            answer: "Vermögen und Kapital",
            explanation: quote,
            difficulty: 1,
            sources: [source],
          })),
        },
      ],
    },
  };
}
test("export contains only selected owned pages, with no account or learning history", () => {
  const w = workspace();
  w.chats.push({
    role: "user",
    content: "Nicht exportieren",
    at: "",
    courseId: "",
  });
  const bundle = exportForChatGPT(w, {
    documentIds: ["doc-private"],
    from: 1,
    to: 1,
  });
  assert.equal(bundle.documents[0].pages.length, 1);
  assert.equal(bundle.documents[0].pages[0].text, quote);
  assert.ok(!JSON.stringify(bundle).includes("Nicht exportieren"));
  assert.throws(
    () => exportForChatGPT(w, { documentIds: ["foreign"] }),
    /Konto|gelöscht/,
  );
  delete w.documents[0].extractedAt;
  assert.throws(
    () => exportForChatGPT(w, { documentIds: ["doc-private"] }),
    /ausgelesen/,
  );
});
test("course import validates sources, persists complete chapters, is idempotent and needs no AI for objective grading", async () => {
  const w = workspace(),
    data = payload();
  const result = importChatGPTCourse(w, data);
  assert.equal(result.created, true);
  assert.equal(w.courses.length, 1);
  assert.equal(w.documents[0].status, "ready");
  assert.equal(w.documents[0].error, undefined);
  const course = w.courses[0];
  assert.ok(course.chapters[0].id);
  assert.ok(course.chapters[0].questions[0].id);
  assert.equal(importChatGPTCourse(w, data).created, false);
  assert.equal(w.courses.length, 1);
  assert.equal(w.attempts.length, 0);
  assert.equal(
    (await grade(course.chapters[0].questions[0], "Vermögen und Kapital"))
      .correct,
    true,
  );
});
test("foreign references, fabricated quotes, semantic-only questions and invalid options are rejected without writing a course", () => {
  for (const modify of [
    (p: any) => (p.course.chapters[0].sources[0].documentId = "foreign"),
    (p: any) => (p.course.chapters[0].sources[0].quote = "Invented"),
    (p: any) => (p.course.chapters[0].questions[0].type = "open"),
    (p: any) => (p.course.chapters[0].questions[0].answer = "not an option"),
  ]) {
    const w = workspace(),
      p = payload();
    modify(p);
    assert.throws(() => importChatGPTCourse(w, p));
    assert.equal(w.courses.length, 0);
    assert.equal(w.documents[0].status, "error");
  }
});
