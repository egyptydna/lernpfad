import { indexDocument } from "./retrieval";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import mammoth from "mammoth";
import { dataDir, getWorkspace, mutate } from "./db";
import { ai, generateCourse, systemPrompt, validateSources } from "./ai";
import type { Doc, Workspace } from "./types";
export const storedPath = (userId: string, id: string) =>
  path.join(dataDir(), "files", userId, id);
const xmlText = (text: string) =>
  text
    .replace(/<a:br\s*\/>/g, "\n")
    .replace(/<\/a:p>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[^\S\n]+/g, " ")
    .trim();
async function safeArchive(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files);
  if (entries.length > 10000)
    throw new Error("Archiv enthält zu viele Einträge.");
  let total = 0;
  for (const file of entries) {
    const size = (file as any)._data?.uncompressedSize || 0;
    total += size;
    if (size > 20_000_000 || total > 100_000_000)
      throw new Error("Entpacktes Dokument ist zu groß (max. 100 MB).");
  }
  return zip;
}
export async function extract(
  buffer: Buffer,
  name: string,
  mime: string,
  options?: {
    pages?: { page: number; text: string }[];
    onProgress?: (
      pages: { page: number; text: string }[],
      total: number,
    ) => Promise<void>;
  },
) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "txt") return [{ page: 1, text: buffer.toString("utf8") }];
  if (ext === "docx") {
    await safeArchive(buffer);
    const r = await mammoth.extractRawText({ buffer });
    return [{ page: 1, text: r.value }];
  }
  if (ext === "pptx") {
    const zip = await safeArchive(buffer);
    let slides = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort(
        (a, b) =>
          Number(a.match(/slide(\d+)/)?.[1]) -
          Number(b.match(/slide(\d+)/)?.[1]),
      );
    const presentation = zip.file("ppt/presentation.xml"),
      presentationRels = zip.file("ppt/_rels/presentation.xml.rels");
    if (presentation && presentationRels) {
      const rels = relationships(await presentationRels.async("string"), "ppt");
      const order = [
        ...(await presentation.async("string")).matchAll(
          /<(?:[\w-]+:)?sldId\b([^>]*)>/g,
        ),
      ].map((m) => {
        const attrs = xmlAttributes(m[1]);
        const id = Object.entries(attrs).find(([key]) =>
          key.endsWith(":id"),
        )?.[1];
        return id
          ? rels.find((r) => r.id === id && r.type.endsWith("/slide"))?.target
          : undefined;
      });
      if (order.length) {
        if (order.some((n) => !n || !zip.files[n]))
          throw new Error(
            "Die Folienreihenfolge der Präsentation ist beschädigt.",
          );
        slides = order as string[];
      }
    }
    if (slides.length > 1000)
      throw new Error("Maximal 1.000 Folien pro Datei.");
    const pages = [];
    let total = 0;
    for (const [slideIndex, n] of slides.entries()) {
      const entry = zip.files[n] as any;
      if (entry._data?.uncompressedSize > 5_000_000)
        throw new Error("Ungewöhnlich große Folie.");
      let text = xmlText(await entry.async("string"));
      const relFile = zip.file(
        path.posix.join(
          path.posix.dirname(n),
          "_rels",
          path.posix.basename(n) + ".rels",
        ),
      );
      if (relFile) {
        const rels = relationships(
          await relFile.async("string"),
          path.posix.dirname(n),
        );
        for (const rel of rels) {
          if (
            (rel.type.endsWith("/notesSlide") || rel.type.endsWith("/chart")) &&
            zip.files[rel.target]
          ) {
            const extra = xmlText(await zip.files[rel.target].async("string"));
            if (extra)
              text +=
                "\n" +
                (rel.type.endsWith("/chart")
                  ? "Diagrammdaten: "
                  : "Sprechernotizen: ") +
                extra;
          }
        }
      }
      total += text.length;
      if (total > 2_000_000)
        throw new Error("Präsentation ist zu umfangreich.");
      pages.push({ page: slideIndex + 1, text });
    }
    return pages;
  }
  if (ext === "pdf") {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
    }).promise;
    if (pdf.numPages > 1000)
      throw new Error("Maximal 1.000 PDF-Seiten pro Datei.");
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const cached = options?.pages?.find((p) => p.page === i && p.text.trim());
      if (cached) {
        pages.push(cached);
        continue;
      }
      const p = await pdf.getPage(i);
      const content = await p.getTextContent();
      let text = content.items.map((x: any) => x.str || "").join(" ");
      if (text.trim().length < 10) {
        const { createCanvas } = await import("@napi-rs/canvas");
        const viewport = p.getViewport({
          scale: Math.min(
            2,
            1800 /
              Math.max(
                p.getViewport({ scale: 1 }).width,
                p.getViewport({ scale: 1 }).height,
              ),
          ),
        });
        const canvas = createCanvas(
          Math.ceil(viewport.width),
          Math.ceil(viewport.height),
        );
        await p.render({
          canvas: canvas as any,
          canvasContext: canvas.getContext("2d") as any,
          viewport,
        }).promise;
        text = await visionText(canvas.toBuffer("image/png"), "image/png");
      }
      pages.push({ page: i, text });
      if (i % 5 === 0 || i === pdf.numPages)
        await options?.onProgress?.([...pages], pdf.numPages);
      p.cleanup();
    }
    await pdf.destroy();
    if (pages.every((p) => p.text.trim().length === 0))
      throw new Error(
        "Diese PDF enthält keinen lesbaren Text. Bitte Seiten als Bilder hochladen (KI-OCR) oder eine PDF mit Textebene verwenden.",
      );
    return pages;
  }
  if (["png", "jpg", "jpeg"].includes(ext || "")) {
    const text = await visionText(
      buffer,
      ext === "png" ? "image/png" : "image/jpeg",
    );
    return [{ page: 1, text }];
  }
  throw new Error("Nicht unterstütztes Dateiformat.");
}
export function documentContext(w: Workspace, ids: string[]) {
  return w.documents
    .filter((d) => ids.includes(d.id))
    .map(
      (d) =>
        `DOKUMENT ${d.id}: ${d.name}\n` +
        d.pages
          .map((p) => `[documentId=${d.id}, page=${p.page}]\n${p.text}`)
          .join("\n"),
    )
    .join("\n\n");
}
export async function processBatch(
  userId: string,
  ids: string[],
  targetCourseId?: string,
  newCourseId = crypto.randomUUID(),
) {
  try {
    let w = await getWorkspace(userId);
    const available = w.documents.filter((d) => ids.includes(d.id));
    if (!available.length || available.every((d) => d.status === "ready"))
      return;
    for (const doc of available) {
      await mutate(userId, (w) => {
        const d = w.documents.find((d) => d.id === doc.id);
        if (d) {
          d.status = "processing";
          d.progress = d.extractedAt ? 45 : 10;
          delete d.error;
        }
      });
      if (!doc.extractedAt) {
        const pages = await extract(
          await fs.readFile(storedPath(userId, doc.id)),
          doc.originalName,
          doc.mime,
          {
            pages: doc.pages,
            onProgress: async (pages, total) => {
              await mutate(userId, (w) => {
                const d = w.documents.find((d) => d.id === doc.id);
                if (d) {
                  d.pages = pages;
                  d.progress = 10 + Math.round((30 * pages.length) / total);
                }
              });
            },
          },
        );
        if (!pages.some((p) => p.text.trim()))
          throw new Error("Kein lesbarer Inhalt in " + doc.name);
        await indexDocument(userId, doc.id, pages);
        await mutate(userId, (w) => {
          const d = w.documents.find((d) => d.id === doc.id);
          if (d) {
            d.pages = pages;
            d.extractedAt = new Date().toISOString();
            d.progress = 45;
          }
        });
      }
    }
    w = await getWorkspace(userId);
    const oldCourse = w.courses.find((c) => c.id === targetCourseId);
    const contextIds = [
      ...new Set([...ids, ...(oldCourse?.documentIds || [])]),
    ];
    const docs = w.documents.filter((d) => contextIds.includes(d.id));
    const context = await summarizedContext(w, contextIds, async (value) => {
      await mutate(userId, (w) => {
        for (const d of w.documents) if (ids.includes(d.id)) d.progress = value;
      });
    });
    const generated = await generateCourse(
      context,
      w.preferences.language,
      w.preferences.difficulty,
    );
    for (const ch of generated.chapters) {
      validateSources(ch.sources, docs);
      for (const q of ch.questions) validateSources(q.sources, docs);
    }
    await mutate(userId, (w) => {
      if (
        ids.every(
          (id) => !w.documents.some((d) => d.id === id && d.status !== "ready"),
        )
      )
        return;
      const existing = w.courses.find(
        (c) => c.id === (targetCourseId || newCourseId),
      );
      const id = existing?.id || newCourseId;
      // Match unchanged chapter titles to preserve notes and mastery after adding sources.
      const chapters = generated.chapters.map((ch) => {
        const old = existing?.chapters.find(
          (o) => o.title.toLowerCase() === ch.title.toLowerCase(),
        );
        return {
          ...ch,
          id: old?.id || crypto.randomUUID(),
          questions: ch.questions.map((q) => ({
            ...q,
            id: crypto.randomUUID(),
          })),
        };
      });
      const course = {
        ...generated,
        id,
        chapters,
        documentIds: contextIds.filter((id) =>
          w.documents.some((d) => d.id === id),
        ),
        createdAt: existing?.createdAt || new Date().toISOString(),
        color:
          existing?.color || ["violet", "blue", "orange"][w.courses.length % 3],
      };
      if (existing) Object.assign(existing, course);
      else w.courses.push(course);
      for (const d of w.documents)
        if (ids.includes(d.id)) {
          d.status = "ready";
          d.progress = 100;
          d.courseId = id;
        }
    });
  } catch (e) {
    await mutate(userId, (w) => {
      for (const d of w.documents)
        if (ids.includes(d.id) && d.status !== "ready") {
          d.status = "error";
          d.error =
            e instanceof Error ? e.message : "Verarbeitung fehlgeschlagen";
        }
    });
    throw e;
  }
}
export async function summarizedContext(
  w: Workspace,
  ids: string[],
  onProgress?: (n: number) => Promise<void>,
) {
  const chunks: string[] = [];
  let chunk = "";
  for (const d of w.documents.filter((d) => ids.includes(d.id)))
    for (const p of d.pages) {
      for (let offset = 0; offset < p.text.length; offset += 40000) {
        const part = `[documentId=${d.id}, page=${p.page}] ${d.name}\n${p.text.slice(offset, offset + 40000)}\n`;
        if (chunk.length + part.length > 50000) {
          chunks.push(chunk);
          chunk = "";
        }
        chunk += part;
      }
    }
  if (chunk) chunks.push(chunk);
  if (chunks.length === 1) return chunks[0];
  let summaries: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    summaries.push(
      await ai([
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Analysiere alle Themen, Kapitel, Definitionen, Formeln und Beispiele. Erhalte documentId, Seitenzahlen und exakte kurze Originalzitate je Thema. Teil ${i + 1}/${chunks.length}:\n${chunks[i]}`,
        },
      ]),
    );
    await onProgress?.(45 + Math.round((40 * (i + 1)) / chunks.length));
  }
  // Hierarchical reduction covers every chunk, rather than truncating the document set.
  while (summaries.join("\n").length > 150000) {
    const reduced: string[] = [];
    for (let i = 0; i < summaries.length; i += 3)
      reduced.push(
        await ai([
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content:
              "Verdichte diese Analysen ohne Themen auszulassen. Erhalte documentId, Seitenzahlen und exakte Originalzitate.\n" +
              summaries.slice(i, i + 3).join("\n"),
          },
        ]),
      );
    if (reduced.join("\n").length >= summaries.join("\n").length)
      throw new Error(
        "Unterlagen sind für eine gemeinsame Analyse zu umfangreich.",
      );
    summaries = reduced;
  }
  return summaries.join("\n");
}

export function retrieveContext(w: Workspace, ids: string[], query: string) {
  const page = query.match(/(?:seite|folie|slide|page)\s*(\d+)/i)?.[1];
  const terms = query.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || [];
  const pages = w.documents
    .filter((d) => ids.includes(d.id))
    .flatMap((d) =>
      d.pages.map((p) => ({
        d,
        p,
        score:
          (page && p.page === Number(page) ? 10000 : 0) +
          terms.reduce(
            (n, t) => n + (p.text.toLowerCase().includes(t) ? 1 : 0),
            0,
          ),
      })),
    )
    .sort((a, b) => b.score - a.score);
  let context = "";
  for (const { d, p } of pages) {
    const entry = `[documentId=${d.id}, page=${p.page}] ${d.name}\n${p.text}\n`;
    if (context.length + entry.length > 100000) continue;
    context += entry;
  }
  return context;
}

async function visionText(buffer: Buffer, mime: string) {
  return ai([
    {
      role: "system",
      content:
        "Extrahiere sichtbaren Text exakt. Tabellen als Markdown, mathematische Formeln als LaTeX. Beschreibe Diagramme sachlich. Markiere unsichere/unlesbare Stellen ausdrücklich mit [unlesbar]. Erfinde keine Inhalte.",
    },
    {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: {
            url: `data:${mime};base64,${buffer.toString("base64")}`,
          },
        },
      ],
    },
  ]);
}

function xmlAttributes(xml: string): Record<string, string> {
  return Object.fromEntries(
    [...xml.matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/g)].map((m) => [
      m[1],
      m[3],
    ]),
  );
}
function relationships(xml: string, base: string) {
  return [...xml.matchAll(/<(?:[\w-]+:)?Relationship\b([^>]*)>/g)]
    .map((m) => xmlAttributes(m[1]))
    .filter((a) => a.Target && a.TargetMode !== "External")
    .map((a) => ({
      id: a.Id,
      type: a.Type || "",
      target: a.Target.startsWith("/")
        ? a.Target.slice(1)
        : path.posix.normalize(path.posix.join(base, a.Target)),
    }));
}
