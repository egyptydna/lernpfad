import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./db";

export const CHUNK_BYTES = 1024 * 1024;
export const MAX_FILE_BYTES = 25 * CHUNK_BYTES;
const validId = (id: string) =>
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id);
function directory(uid: string, id: string) {
  if (!validId(id)) throw new Error("Ungültige Upload-Kennung.");
  return path.join(dataDir(), "uploads", uid, id);
}
export function validateFile(name: string, size: number) {
  if (
    !Number.isInteger(size) ||
    size < 1 ||
    size > MAX_FILE_BYTES ||
    name.length > 255 ||
    !/\.(pdf|docx|pptx|txt|png|jpg|jpeg)$/i.test(name)
  )
    throw new Error(
      "Erlaubt: PDF, DOCX, PPTX, TXT, PNG und JPG, maximal 25 MB pro Datei.",
    );
}
export async function saveChunk(uid: string, form: FormData) {
  const id = String(form.get("id") || ""),
    dir = directory(uid, id);
  const name = String(form.get("name") || ""),
    size = Number(form.get("size"));
  const index = Number(form.get("index")),
    chunk = form.get("chunk");
  validateFile(name, size);
  const count = Math.ceil(size / CHUNK_BYTES);
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= count ||
    !(chunk instanceof File) ||
    chunk.size !== Math.min(CHUNK_BYTES, size - index * CHUNK_BYTES)
  )
    throw new Error("Unvollständiges Datei-Teilstück. Bitte erneut hochladen.");
  const root = path.dirname(dir);
  await fs.mkdir(root, { recursive: true });
  const entries = await fs.readdir(root, { withFileTypes: true });
  let active = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const target = path.join(root, entry.name),
      stat = await fs.stat(target).catch(() => null);
    if (stat && Date.now() - stat.mtimeMs > 24 * 60 * 60 * 1000)
      await fs.rm(target, { recursive: true, force: true });
    else active++;
  }
  if (active >= 10 && !entries.some((e) => e.name === id))
    throw new Error(
      "Zu viele unvollständige Uploads. Bitte später erneut versuchen.",
    );
  await fs.mkdir(dir, { recursive: true });
  const manifest = JSON.stringify({ name, size });
  try {
    await fs.writeFile(path.join(dir, "manifest.json"), manifest, {
      flag: "wx",
      mode: 0o600,
    });
  } catch (e: any) {
    if (e.code !== "EEXIST") throw e;
  }
  if ((await fs.readFile(path.join(dir, "manifest.json"), "utf8")) !== manifest)
    throw new Error("Die Upload-Kennung gehört zu einer anderen Datei.");
  const temp = path.join(dir, `${index}-${crypto.randomUUID()}.tmp`);
  await fs.writeFile(temp, Buffer.from(await chunk.arrayBuffer()), {
    mode: 0o600,
  });
  await fs.rename(temp, path.join(dir, String(index)));
  await fs.utimes(dir, new Date(), new Date());
  return { ok: true, index };
}
export async function assembleUpload(uid: string, id: string) {
  const dir = directory(uid, id);
  let manifest;
  try {
    manifest = JSON.parse(
      await fs.readFile(path.join(dir, "manifest.json"), "utf8"),
    );
  } catch {
    throw new Error("Upload nicht gefunden. Bitte die Datei erneut auswählen.");
  }
  validateFile(manifest.name, manifest.size);
  const parts = [];
  for (let index = 0; index < Math.ceil(manifest.size / CHUNK_BYTES); index++) {
    const part = await fs
      .readFile(path.join(dir, String(index)))
      .catch(() => null);
    if (
      !part ||
      part.length !== Math.min(CHUNK_BYTES, manifest.size - index * CHUNK_BYTES)
    )
      throw new Error(
        "Die Datei wurde nicht vollständig übertragen. Bitte erneut versuchen.",
      );
    parts.push(part);
  }
  return new File([Buffer.concat(parts)], manifest.name);
}
export async function removeUpload(uid: string, id: string) {
  await fs.rm(directory(uid, id), { recursive: true, force: true });
}
