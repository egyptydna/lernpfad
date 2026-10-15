const CHUNK_BYTES = 1024 * 1024;
async function send(route: string, form: FormData) {
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(route, { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          data.error ||
          (response.status === 413
            ? "Die Übertragung wurde wegen ihrer Größe abgelehnt."
            : `Upload fehlgeschlagen (HTTP ${response.status}).`);
        if (response.status < 500)
          throw Object.assign(new Error(message), { permanent: true });
        throw new Error(message);
      }
      return data;
    } catch (error: any) {
      if (error.permanent) throw error;
      lastError = error.message;
      if (attempt < 2)
        await new Promise((resolve) =>
          setTimeout(resolve, 750 * (attempt + 1)),
        );
    }
  }
  throw new Error(
    `Die Verbindung wurde beim Hochladen unterbrochen. Bitte prüfe, ob dein Codespace noch läuft, und versuche es erneut. (${lastError})`,
  );
}
export async function uploadDocuments(
  files: File[],
  courseId: string,
  progress: (message: string) => void,
) {
  for (const file of files) {
    if (
      !file.size ||
      file.size > 25 * CHUNK_BYTES ||
      !/\.(pdf|docx|pptx|txt|png|jpg|jpeg)$/i.test(file.name)
    )
      throw new Error(
        "Erlaubt: PDF, DOCX, PPTX, TXT, PNG und JPG, maximal 25 MB pro Datei.",
      );
  }
  const ids = files.map(() => crypto.randomUUID());
  const total = files.reduce((sum, file) => sum + file.size, 0);
  let sent = 0;
  for (const [fileIndex, file] of files.entries()) {
    for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
      const chunk = file.slice(offset, offset + CHUNK_BYTES);
      const form = new FormData();
      form.set("id", ids[fileIndex]);
      form.set("name", file.name);
      form.set("size", String(file.size));
      form.set("index", String(offset / CHUNK_BYTES));
      form.set("chunk", chunk, "chunk.bin");
      progress(
        `${file.name} · ${Math.floor((sent / total) * 100)} % übertragen`,
      );
      await send("/api/upload/chunk", form);
      sent += chunk.size;
    }
  }
  progress("100 % übertragen · Datei wird gespeichert …");
  const form = new FormData();
  form.set("uploadIds", JSON.stringify(ids));
  form.set("courseId", courseId);
  return send("/api/upload", form);
}
