"use client";
import { useEffect, useState } from "react";
type Connection = {
  enabled: boolean;
  connected: boolean;
  active?: string;
  model: string;
  profiles: { id: string; email: string; connected: boolean }[];
};
export default function ChatGPTConnection() {
  const [status, setStatus] = useState<Connection>(),
    [models, setModels] = useState<{ id: string; name: string }[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function request(route: string, body?: unknown) {
    const r = await fetch("/api/chatgpt/" + route, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Verbindung fehlgeschlagen.");
    return data;
  }
  async function reload() {
    const s = await request("status");
    setStatus(s);
    if (s.enabled && s.connected) setModels((await request("models")).models);
    else setModels([]);
  }
  useEffect(() => {
    void reload().catch((e) => setError(e.message));
  }, []);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel settings-panel">
      <h3>Mit deinem ChatGPT-Konto lernen</h3>
      <p className="small muted">
        Verbinde dein Konto einmal bei OpenAI. Wenn dein Tarif berechtigt ist
        und du die Nutzung freigibst, laufen Tutor, Kurse und Aufgaben über dein
        ChatGPT-Kontingent. Deine bisherigen ChatGPT-Chats werden nicht
        übertragen.
      </p>
      {!status && !error && <p>Verbindung wird geprüft …</p>}
      {status && !status.enabled && (
        <p>
          Diese Verbindung ist für die lokale Version vorgesehen. Starte sie mit{" "}
          <code>npm run app</code>. Für den Betrieb unter einer öffentlichen
          Domain sind eine OpenAI-Freigabe oder die separate API nötig.
        </p>
      )}
      {status?.enabled && (
        <>
          <span className={"pill " + (status.connected ? "green" : "amber")}>
            {status.connected ? "ChatGPT verbunden" : "Noch nicht verbunden"}
          </span>
          {status.profiles.length > 0 && (
            <label>
              ChatGPT-Konto
              <select
                value={status.active || ""}
                disabled={busy}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id)
                    void perform(async () => {
                      await request("manage", { action: "switch", id });
                      await reload();
                    });
                }}
              >
                <option value="">Konto auswählen</option>
                {status.profiles.map((p, i) => (
                  <option key={p.id} value={p.id} disabled={!p.connected}>
                    {p.email} · Konto {i + 1}
                    {p.connected ? "" : " (getrennt)"}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div
            className="button-row"
            style={{ flexWrap: "wrap", marginTop: 16 }}
          >
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  const r = await request(
                    "start",
                    status.active ? { id: status.active } : {},
                  );
                  window.location.assign(r.url);
                })
              }
            >
              Continue with ChatGPT
            </button>
            {status.profiles.length > 0 && (
              <button
                className="button outline"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    const r = await request("start", {});
                    window.location.assign(r.url);
                  })
                }
              >
                Anderes Konto verbinden
              </button>
            )}
          </div>
          {status.profiles
            .filter((p) => !p.connected)
            .map((p, i) => (
              <button
                key={p.id}
                className="button outline"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    const r = await request("start", { id: p.id });
                    window.location.assign(r.url);
                  })
                }
              >
                {p.email} · Konto {i + 1} erneut verbinden
              </button>
            ))}
          {status.connected && (
            <>
              {models.length > 0 && (
                <label style={{ marginTop: 16 }}>
                  ChatGPT-Modell
                  <select
                    disabled={busy}
                    value={status.model || models[0]?.id || ""}
                    onChange={(e) => {
                      const id = e.target.value;
                      void perform(async () => {
                        await request("manage", { action: "model", id });
                        await reload();
                      });
                    }}
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                className="button outline"
                disabled={busy}
                style={{ marginTop: 12 }}
                onClick={() =>
                  void perform(async () => {
                    const r = await request("manage", { action: "disconnect" });
                    await reload();
                    setNotice(
                      r.warning ||
                        "ChatGPT-Verbindung getrennt. Deine Lernstände bleiben gespeichert.",
                    );
                  })
                }
              >
                ChatGPT-Verbindung trennen
              </button>
            </>
          )}
          <p className="small muted">
            Die Nutzung zählt zu deinem ChatGPT-Kontingent. Es erfolgt kein
            automatischer Wechsel zur kostenpflichtigen API. Nach dem Verbinden
            kannst du fehlgeschlagene Uploads erneut versuchen.
          </p>
          <a
            href="https://chatgpt.com/settings/usage"
            target="_blank"
            rel="noreferrer"
          >
            ChatGPT-Nutzung und Limits verwalten
          </a>
        </>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
