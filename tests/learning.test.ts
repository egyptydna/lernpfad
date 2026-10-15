import test from "node:test";
import assert from "node:assert/strict";
import { updateMastery, adaptiveDifficulty, xpFor } from "../lib/learning";
import { passwordHash, passwordMatches } from "../lib/auth";
import { grade, validateSources, courseSchema } from "../lib/ai";
import { extract } from "../lib/documents";
import JSZip from "jszip";
test("mastery adapts to success, failure and review intervals", () => {
  const now = new Date("2026-01-01");
  let m = updateMastery(undefined, true, 1, now);
  assert.ok(m.score > 0);
  assert.equal(m.interval, 1);
  const score = m.score;
  for (let i = 0; i < 12; i++) m = updateMastery(m, true, 3, now);
  assert.ok(m.score > score);
  assert.equal(adaptiveDifficulty(m), 3);
  const old = m.score;
  m = updateMastery(m, false, 3, now);
  assert.ok(m.score < old);
  assert.equal(m.streak, 0);
  assert.equal(m.interval, 0);
  assert.equal(new Date(m.due).getTime() - now.getTime(), 600000);
  assert.equal(xpFor(false, 3), 0);
  assert.equal(xpFor(true, 3), 20);
});
test("password hashing uses random salts and verifies safely", () => {
  const a = passwordHash("long-secret-password"),
    b = passwordHash("long-secret-password");
  assert.notEqual(a, b);
  assert.equal(passwordMatches("long-secret-password", a), true);
  assert.equal(passwordMatches("wrong-password", a), false);
  assert.equal(passwordMatches("x", "corrupt"), false);
});
test("source validation rejects invented documents, pages and quotes", () => {
  const docs = [
    {
      id: "a",
      pages: [{ page: 3, text: "Die Bilanz zeigt Vermögen und Kapital." }],
    },
  ];
  assert.doesNotThrow(() =>
    validateSources(
      [{ documentId: "a", page: 3, quote: "Vermögen und Kapital" }],
      docs,
    ),
  );
  for (const source of [
    { documentId: "b", page: 3, quote: "Bilanz" },
    { documentId: "a", page: 4, quote: "Bilanz" },
    { documentId: "a", page: 3, quote: "Erfundene Definition" },
  ])
    assert.throws(() => validateSources([source], docs));
});
const question = {
  id: "q",
  type: "single",
  prompt: "Welches Ergebnis?",
  options: ["4", "5"],
  answer: "4",
  explanation: "2 + 2 = 4.",
  difficulty: 1,
  sources: [],
};
test("objective answers are graded on the server without AI", async () => {
  assert.equal((await grade(question, "4")).correct, true);
  assert.equal((await grade(question, "5")).correct, false);
  assert.equal(
    (
      await grade(
        { ...question, type: "multiple", answer: '["A","C"]' },
        '["C","A"]',
      )
    ).correct,
    true,
  );
  assert.equal(
    (
      await grade(
        { ...question, type: "multiple", answer: '["A","C"]' },
        '["A"]',
      )
    ).correct,
    false,
  );
  assert.equal(
    (
      await grade(
        { ...question, type: "ordering", answer: '["A","B"]' },
        '["B","A"]',
      )
    ).correct,
    false,
  );
});
test("TXT and PPTX extraction preserve actual slide numbers", async () => {
  assert.equal(
    (await extract(Buffer.from("Lerninhalt"), "a.txt", "text/plain"))[0].text,
    "Lerninhalt",
  );
  const zip = new JSZip();
  zip.file("ppt/slides/slide2.xml", "<a:p><a:t>Zweite Folie</a:t></a:p>");
  zip.file("ppt/slides/slide1.xml", "<a:p><a:t>Erste Folie</a:t></a:p>");
  const pages = await extract(
    await zip.generateAsync({ type: "nodebuffer" }),
    "a.pptx",
    "",
  );
  assert.equal(pages[0].page, 1);
  assert.ok(pages[1].text.includes("Zweite Folie"));
});
test("generation rejects incomplete or unsupported tasks", () => {
  assert.throws(() =>
    courseSchema.parse({ title: "x", description: "x", chapters: [] }),
  );
});
test("DOCX paragraph text is extracted from a real OOXML archive", async () => {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Die Bilanz zeigt Vermögen.</w:t></w:r></w:p></w:body></w:document>',
  );
  const pages = await extract(
    await zip.generateAsync({ type: "nodebuffer" }),
    "a.docx",
    "",
  );
  assert.ok(pages[0].text.includes("Bilanz"));
});
test("PDF extraction preserves page numbers and reads text content", async () => {
  const stream = "BT /F1 12 Tf 50 750 Td (Bilanz und Kapital) Tj ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objs.length; i++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const start = Buffer.byteLength(pdf);
  pdf +=
    `xref\n0 6\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  const pages = await extract(Buffer.from(pdf), "a.pdf", "application/pdf");
  assert.equal(pages[0].page, 1);
  assert.ok(pages[0].text.includes("Bilanz und Kapital"));
});
test("matching questions compare pair mappings rather than accepting arbitrary text", async () => {
  const q = {
    ...question,
    type: "matching",
    options: ["Aktiva → Mittelverwendung", "Passiva → Mittelherkunft"],
    answer: "Aktiva gehört zu Mittelverwendung; Passiva zu Mittelherkunft",
  };
  assert.equal(
    (
      await grade(
        q,
        JSON.stringify({
          Aktiva: "Mittelverwendung",
          Passiva: "Mittelherkunft",
        }),
      )
    ).correct,
    true,
  );
  assert.equal(
    (
      await grade(
        q,
        JSON.stringify({
          Aktiva: "Mittelherkunft",
          Passiva: "Mittelverwendung",
        }),
      )
    ).correct,
    false,
  );
});
test("adaptive difficulty respects configured mastery thresholds", () => {
  const m = updateMastery(undefined, true, 1);
  m.score = 65;
  assert.equal(adaptiveDifficulty(m, [30, 60, 90]), 3);
  assert.equal(adaptiveDifficulty(m, [50, 80, 95]), 2);
});
test("PDF pages without a text layer are rendered for vision OCR and cached pages are reused", async () => {
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
  const oldFetch = globalThis.fetch,
    oldKey = process.env.OPENAI_API_KEY;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.ok(
      body.messages[1].content[0].image_url.url.startsWith(
        "data:image/png;base64,",
      ),
    );
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: { content: "Eine erkannte Definition." },
            finish_reason: "stop",
          },
        ],
      }),
      { status: 200 },
    );
  };
  process.env.OPENAI_API_KEY = "unit-test-only";
  try {
    const pages = await extract(
      Buffer.from(pdf),
      "scan.pdf",
      "application/pdf",
    );
    assert.equal(pages[0].text, "Eine erkannte Definition.");
    const cached = await extract(
      Buffer.from(pdf),
      "scan.pdf",
      "application/pdf",
      { pages },
    );
    assert.equal(cached[0].text, pages[0].text);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
});
test("math rendering remains compatible with the patched KaTeX version", async () => {
  const { renderToString } = await import("katex");
  const html = renderToString("x^2 + \\frac{1}{2}", {
    trust: false,
    throwOnError: false,
  });
  assert.ok(html.includes("katex"));
  assert.ok(html.includes("frac"));
});
test("mastery can reach 100 rather than rounding indefinitely at 99", () => {
  const m = updateMastery(undefined, true, 1);
  m.score = 99;
  assert.equal(updateMastery(m, true, 1).score, 100);
});
test("Markdown math uses the patched renderer through the full remark/rehype pipeline", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: Markdown } = await import("react-markdown");
  const { default: math } = await import("remark-math");
  const { default: katex } = await import("rehype-katex");
  const html = renderToStaticMarkup(
    createElement(
      Markdown,
      { remarkPlugins: [math], rehypePlugins: [katex] },
      "Eine Formel: $x^2 + 1$.",
    ),
  );
  assert.ok(html.includes("katex"));
});
test("PPTX citations use presentation order and include speaker notes and chart values", async () => {
  const zip = new JSZip();
  zip.file(
    "ppt/slides/slide1.xml",
    "<a:p><a:t>Ursprünglich erste Folie</a:t></a:p>",
  );
  zip.file(
    "ppt/slides/slide2.xml",
    "<a:p><a:t>Jetzt zuerst sichtbar</a:t></a:p>",
  );
  zip.file(
    "ppt/presentation.xml",
    '<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst></p:presentation>',
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    '<Relationships><Relationship Id="rId1" Type="urn:test/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="urn:test/slide" Target="slides/slide2.xml"/></Relationships>',
  );
  zip.file(
    "ppt/slides/_rels/slide2.xml.rels",
    '<Relationships><Relationship Id="n" Type="urn:test/notesSlide" Target="../notesSlides/notesSlide2.xml"/><Relationship Id="c" Type="urn:test/chart" Target="../charts/chart1.xml"/></Relationships>',
  );
  zip.file(
    "ppt/notesSlides/notesSlide2.xml",
    "<a:p><a:t>Wichtiger Hinweis</a:t></a:p>",
  );
  zip.file("ppt/charts/chart1.xml", "<c:v>Umsatz</c:v><c:v>42</c:v>");
  const pages = await extract(
    await zip.generateAsync({ type: "nodebuffer" }),
    "order.pptx",
    "",
  );
  assert.equal(pages[0].page, 1);
  assert.ok(pages[0].text.startsWith("Jetzt zuerst"));
  assert.ok(pages[0].text.includes("Wichtiger Hinweis"));
  assert.ok(pages[0].text.includes("42"));
  assert.ok(pages[1].text.includes("Ursprünglich erste"));
});
