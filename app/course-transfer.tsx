"use client";
import { useState } from "react";
export default function CourseTransfer({
  documents,
  onImported,
}: {
  documents: { id: string; name: string; pageCount?: number }[];
  onImported: (id: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [from, setFrom] = useState(1),
    [to, setTo] = useState(25),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function request(route: string, body: unknown) {
    const r = await fetch("/api/transfer/" + route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Übertragung fehlgeschlagen.");
    return data;
  }
  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel settings-panel" style={{ marginBottom: 24 }}>
      <h2>Mit ChatGPT lernen – ohne API-Schlüssel</h2>
      <p>
        Lade zuerst deine Unterlagen hoch. Exportiere dann einen Lernauftrag,
        füge die Datei hier in ChatGPT hinzu und bitte um die fertige Kursdatei.
        Diese importierst du wieder hier.
      </p>
      <p className="small muted">
        Dies ist ein manueller Dateiweg. Es gibt keine automatische
        Live-Verbindung. Erklärungen und objektiv bewertbare Übungen laufen nach
        dem Import ohne API; Tutor-Chat und KI-Freitextbewertung benötigen
        weiterhin einen eigenen Zugang. Scan-PDFs und Bilder lassen sich so
        nicht ohne Texterkennung exportieren.
      </p>
      {documents.length > 0 && (
        <fieldset
          disabled={busy}
          style={{ border: 0, padding: 0, margin: "16px 0" }}
        >
          <legend>Unterlagen auswählen</legend>
          {documents.map((d) => (
            <label
              key={d.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                margin: "8px 0",
              }}
            >
              <input
                type="checkbox"
                checked={selected.includes(d.id)}
                style={{ width: "auto" }}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, d.id]
                      : selected.filter((id) => id !== d.id),
                  )
                }
              />
              {d.name}
            </label>
          ))}
        </fieldset>
      )}
      <div className="form-grid">
        <label>
          Erste Seite / Folie
          <input
            type="number"
            min={1}
            max={1000}
            value={from}
            disabled={busy}
            onChange={(e) => setFrom(Number(e.target.value))}
          />
        </label>
        <label>
          Letzte Seite / Folie
          <input
            type="number"
            min={from}
            max={1000}
            value={to}
            disabled={busy}
            onChange={(e) => setTo(Number(e.target.value))}
          />
        </label>
      </div>
      <div
        className="button-row"
        style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}
      >
        <button
          className="button primary"
          disabled={busy || !selected.length}
          onClick={() =>
            void perform(async () => {
              const data = await request("export", {
                documentIds: selected,
                from,
                to,
              });
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(data, null, 2)], {
                  type: "application/json",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "ChatGPT-Lernauftrag.json";
              document.body.appendChild(a);
              a.click();
              a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 60000);
              setNotice(
                "Lernauftrag heruntergeladen. Hänge diese Datei in ChatGPT an und schreibe: „Bitte erstelle daraus die angeforderte Kursdatei.“",
              );
            })
          }
        >
          1. Lernauftrag exportieren
        </button>
        <label
          className="button outline"
          style={{ cursor: busy ? "wait" : "pointer" }}
        >
          2. Fertige Kursdatei importieren
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              void perform(async () => {
                if (file.size > 2000000)
                  throw new Error("Die Kursdatei darf maximal 2 MB groß sein.");
                let data;
                try {
                  data = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
                } catch {
                  throw new Error(
                    "Bitte die JSON-Datei aus ChatGPT wählen, keine PDF- oder Word-Datei.",
                  );
                }
                const result = await request("import", data);
                setNotice(
                  result.created
                    ? "Kurs gespeichert."
                    : "Dieser Kurs wurde bereits importiert.",
                );
                await onImported(result.courseId);
              });
            }}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
