import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { dataDir } from "./db";
const root = () => path.join(dataDir(), "chatgpt");
const issuer = "https://auth.openai.com";
const resource = "https://api.openai.com/v1";
const globalState = globalThis as unknown as {
  aiUser?: AsyncLocalStorage<string | undefined>;
};
const context = (globalState.aiUser ||= new AsyncLocalStorage<
  string | undefined
>());
export const withAiUser = <T>(userId: string | undefined, action: () => T): T =>
  context.run(userId, action);
export const localChatGPTEnabled = () => process.env.CHATGPT_LOCAL === "true";
export function localOrigin(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(u.hostname) ||
    u.username ||
    u.password
  )
    throw new Error(
      "ChatGPT-Verbindung ist für den lokalen Betrieb auf diesem Computer vorgesehen.",
    );
  return u.origin;
}
type Profile = {
  clientId: string;
  subject: string;
  email: string;
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: number;
  scopes: string[];
  model?: string;
};
type Store = { active?: string; profiles: Profile[] };
type Pending = {
  userId: string;
  state: string;
  nonce: string;
  verifier: string;
  redirect: string;
  returnOrigin: string;
  clientId?: string;
  subject?: string;
  expires: number;
};
const fileFor = (userId: string) =>
  path.join(
    root(),
    createHash("sha256").update(userId).digest("hex") + ".json",
  );
async function prepare() {
  await fs.mkdir(root(), { recursive: true, mode: 0o700 });
}
async function atomic(file: string, value: unknown) {
  const temp = file + "." + randomUUID() + ".tmp";
  try {
    await fs.writeFile(temp, JSON.stringify(value), {
      mode: 0o600,
      flag: "wx",
    });
    await fs.rename(temp, file);
  } finally {
    await fs.unlink(temp).catch(() => {});
  }
}
async function readStore(uid: string): Promise<Store> {
  try {
    return JSON.parse(await fs.readFile(fileFor(uid), "utf8"));
  } catch (e: any) {
    if (e.code === "ENOENT") return { profiles: [] };
    throw e;
  }
}
async function locked<T>(
  uid: string,
  action: (store: Store) => Promise<T>,
): Promise<T> {
  await prepare();
  const lock = fileFor(uid) + ".lock";
  let handle;
  for (let i = 0; i < 150; i++) {
    try {
      handle = await fs.open(lock, "wx", 0o600);
      break;
    } catch (e: any) {
      if (e.code !== "EEXIST") throw e;
      const info = await fs.stat(lock).catch(() => undefined);
      if (info && Date.now() - info.mtimeMs > 120000)
        await fs.unlink(lock).catch(() => {});
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!handle)
    throw new Error(
      "ChatGPT-Verbindung ist beschäftigt. Bitte erneut versuchen.",
    );
  try {
    const store = await readStore(uid);
    const result = await action(store);
    await atomic(fileFor(uid), store);
    return result;
  } finally {
    await handle.close();
    await fs.unlink(lock).catch(() => {});
  }
}
async function hostId() {
  await prepare();
  const file = path.join(root(), "host-id");
  try {
    await fs.writeFile(file, "urn:uuid:" + randomUUID(), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (e: any) {
    if (e.code !== "EEXIST") throw e;
  }
  return (await fs.readFile(file, "utf8")).trim();
}
async function authPost(endpoint: string, values: Record<string, string>) {
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok)
    throw new Error(
      "ChatGPT-Verbindung konnte nicht erneuert werden. Bitte erneut verbinden.",
    );
  return r;
}
let discovery: { jwks_uri: string; revocation_endpoint?: string } | undefined;
async function configuration() {
  if (!discovery) {
    const r = await fetch(issuer + "/.well-known/openid-configuration", {
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error("OpenAI-Anmeldedienst ist nicht erreichbar.");
    const d = await r.json();
    for (const endpoint of [d.jwks_uri, d.revocation_endpoint].filter(
      Boolean,
    )) {
      if (new URL(endpoint).origin !== issuer)
        throw new Error("Ungültiger OpenAI-Anmeldedienst.");
    }
    if (d.issuer !== issuer || !d.jwks_uri)
      throw new Error("Ungültige OpenAI-Konfiguration.");
    discovery = d;
  }
  return discovery!;
}
export async function chatGPTStatus(uid: string) {
  const store = await readStore(uid);
  const active = store.profiles.find((p) => p.clientId === store.active);
  return {
    enabled: localChatGPTEnabled(),
    connected: localChatGPTEnabled() && Boolean(active?.accessToken),
    active: store.active,
    model: active?.model || "",
    profiles: store.profiles.map((p) => ({
      id: p.clientId,
      email: p.email,
      connected: Boolean(p.accessToken),
    })),
  };
}
export async function beginChatGPT(
  uid: string,
  origin: string,
  selected?: string,
) {
  if (!localChatGPTEnabled())
    throw new Error(
      "Lokale ChatGPT-Verbindung ist deaktiviert. CHATGPT_LOCAL=true setzen.",
    );
  const returnOrigin = localOrigin(origin);
  const store = await readStore(uid);
  const profile = selected
    ? store.profiles.find((p) => p.clientId === selected)
    : undefined;
  if (selected && !profile) throw new Error("ChatGPT-Konto nicht gefunden.");
  const nonce = randomBytes(32).toString("base64url"),
    state = randomBytes(32).toString("base64url"),
    verifier = randomBytes(48).toString("base64url");
  const callback = new URL(returnOrigin);
  callback.hostname = "127.0.0.1";
  callback.pathname = "/api/chatgpt/callback";
  const redirect = callback.toString();
  const pending: Pending = {
    userId: uid,
    state,
    nonce,
    verifier,
    redirect,
    returnOrigin,
    clientId: profile?.clientId,
    subject: profile?.subject,
    expires: Date.now() + 600000,
  };
  await prepare();
  // Remove expired attempts without retaining unused authorization material indefinitely.
  for (const name of await fs.readdir(root()))
    if (name.startsWith("pending-")) {
      const file = path.join(root(), name);
      const stat = await fs.stat(file).catch(() => undefined);
      if (stat && Date.now() - stat.mtimeMs > 600000)
        await fs.unlink(file).catch(() => {});
    }
  await atomic(path.join(root(), "pending-" + state + ".json"), pending);
  const params = new URLSearchParams({
    client_id: profile?.clientId || "dynamic_agent_client",
    ext_agent_host_id: await hostId(),
    response_type: "code",
    redirect_uri: redirect,
    scope:
      "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
    resource,
    state,
    nonce,
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  });
  if (!profile) params.set("agent_name_hint", "Lernpfad");
  else {
    if (profile.idToken) params.set("id_token_hint", profile.idToken);
    if (profile.email) params.set("login_hint", profile.email);
  }
  return issuer + "/api/accounts/authorize?" + params;
}
export async function finishChatGPT(url: URL) {
  if (!localChatGPTEnabled())
    throw new Error("Lokale ChatGPT-Verbindung ist deaktiviert.");
  localOrigin(url.origin);
  const state = url.searchParams.get("state") || "";
  if (!/^[\w-]{43}$/.test(state)) throw new Error("Ungültige Anmeldeanfrage.");
  const file = path.join(root(), "pending-" + state + ".json"),
    claim = file + ".claimed";
  try {
    await fs.rename(file, claim);
  } catch {
    throw new Error("Anmeldeanfrage ist abgelaufen oder bereits verwendet.");
  }
  try {
    const p: Pending = JSON.parse(await fs.readFile(claim, "utf8"));
    if (
      p.state !== state ||
      p.expires < Date.now() ||
      url.origin + url.pathname !== p.redirect
    )
      throw new Error("Anmeldeanfrage ist ungültig oder abgelaufen.");
    if (url.searchParams.has("error"))
      throw new Error(
        "ChatGPT-Verbindung wurde nicht freigegeben. Du kannst sie später erneut starten.",
      );
    const clientId = url.searchParams.get("client_id") || p.clientId;
    if (
      !clientId ||
      !clientId.startsWith("oaiapp_") ||
      (p.clientId && p.clientId !== clientId)
    )
      throw new Error("Ungültige ChatGPT-Registrierung.");
    const code = url.searchParams.get("code");
    if (!code) throw new Error("Anmeldecode fehlt.");
    const tokens = await (
      await authPost(issuer + "/api/accounts/oauth/token", {
        grant_type: "authorization_code",
        client_id: clientId,
        code,
        code_verifier: p.verifier,
        redirect_uri: p.redirect,
        resource,
      })
    ).json();
    const cfg = await configuration();
    const { payload } = await jwtVerify(
      tokens.id_token,
      createRemoteJWKSet(new URL(cfg.jwks_uri)),
      { issuer, audience: clientId, algorithms: ["RS256"] },
    );
    if (
      payload.nonce !== p.nonce ||
      !payload.sub ||
      (p.subject && p.subject !== payload.sub)
    )
      throw new Error(
        "ChatGPT-Identität stimmt nicht mit der Anmeldung überein.",
      );
    const scopes = String(tokens.scope || "").split(" ");
    if (
      !scopes.includes("chatgpt.tokens.use.direct") ||
      !tokens.access_token ||
      tokens.token_type?.toLowerCase() !== "bearer" ||
      !Number.isFinite(tokens.expires_in) ||
      tokens.expires_in <= 0
    )
      throw new Error(
        "ChatGPT-Nutzung wurde nicht freigegeben. Bitte die Berechtigungen bei OpenAI prüfen.",
      );
    await locked(p.userId, async (store) => {
      const old = store.profiles.find((s) => s.clientId === clientId);
      if (old && old.subject !== payload.sub)
        throw new Error("ChatGPT-Konto stimmt nicht überein.");
      const profile: Profile = {
        clientId,
        subject: payload.sub!,
        email:
          typeof payload.email === "string" ? payload.email : "ChatGPT-Konto",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        idToken: tokens.id_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
        scopes,
        model: old?.model,
      };
      store.profiles = store.profiles
        .filter((s) => s.clientId !== clientId)
        .concat(profile);
      store.active = clientId;
    });
    return p.returnOrigin;
  } finally {
    await fs.unlink(claim).catch(() => {});
  }
}
async function credential(uid: string): Promise<Profile | undefined> {
  return locked(uid, async (store) => {
    const profile = store.profiles.find((p) => p.clientId === store.active);
    if (!profile?.accessToken) return undefined;
    if (profile.expiresAt < Date.now() + 60000) {
      if (!profile.refreshToken)
        throw new Error(
          "ChatGPT-Verbindung ist abgelaufen. Bitte erneut verbinden.",
        );
      const t = await (
        await authPost(issuer + "/api/accounts/oauth/token", {
          grant_type: "refresh_token",
          client_id: profile.clientId,
          refresh_token: profile.refreshToken,
          resource,
        })
      ).json();
      const scopes = t.scope ? String(t.scope).split(" ") : profile.scopes;
      if (
        !t.access_token ||
        !t.refresh_token ||
        !Number.isFinite(t.expires_in) ||
        !scopes.includes("chatgpt.tokens.use.direct")
      )
        throw new Error("ChatGPT-Verbindung muss erneut freigegeben werden.");
      Object.assign(profile, {
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        expiresAt: Date.now() + t.expires_in * 1000,
        scopes,
      });
    }
    return { ...profile };
  });
}
export async function chatGPTModels(uid: string) {
  if (!localChatGPTEnabled())
    throw new Error("Lokale ChatGPT-Verbindung ist deaktiviert.");
  const p = await credential(uid);
  if (!p) throw new Error("Bitte zuerst mit ChatGPT verbinden.");
  const r = await fetch(resource + "/models", {
    headers: { Authorization: "Bearer " + p.accessToken },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok)
    throw new Error(
      "ChatGPT-Modelle können nicht geladen werden. Bitte Verbindung und Tarif prüfen.",
    );
  const body = await r.json();
  return (body.models || [])
    .filter((m: any) => m.visibility === "list" && typeof m.slug === "string")
    .map((m: any) => ({ id: m.slug, name: m.display_name || m.slug }));
}
export async function changeChatGPT(uid: string, action: string, id?: string) {
  if (!localChatGPTEnabled())
    throw new Error("Lokale ChatGPT-Verbindung ist deaktiviert.");
  if (action === "model") {
    const models = await chatGPTModels(uid);
    if (!models.some((m: any) => m.id === id))
      throw new Error("Dieses Modell ist für dein Konto nicht verfügbar.");
    return locked(uid, async (store) => {
      const p = store.profiles.find((p) => p.clientId === store.active);
      if (p) p.model = id;
      return { ok: true };
    });
  }
  return locked(uid, async (store) => {
    const p = store.profiles.find((p) => p.clientId === (id || store.active));
    if (!p) throw new Error("ChatGPT-Konto nicht gefunden.");
    if (action === "switch") {
      if (!p.accessToken)
        throw new Error("Bitte dieses Konto erneut verbinden.");
      store.active = p.clientId;
      return { ok: true };
    }
    if (action !== "disconnect") throw new Error("Unbekannte Aktion.");
    let revoked = false;
    if (p.refreshToken) {
      for (let attempt = 0; attempt < 3 && !revoked; attempt++) {
        try {
          const cfg = await configuration();
          if (cfg.revocation_endpoint) {
            await authPost(cfg.revocation_endpoint, {
              token: p.refreshToken,
              token_type_hint: "refresh_token",
              client_id: p.clientId,
            });
            revoked = true;
          }
        } catch {
          if (attempt < 2)
            await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
        }
      }
    }
    delete p.accessToken;
    delete p.refreshToken;
    delete p.idToken;
    if (store.active === p.clientId) delete store.active;
    return {
      ok: true,
      warning: revoked
        ? ""
        : "Lokal getrennt. Der Widerruf bei OpenAI wurde nicht bestätigt. Bitte gegebenenfalls in den ChatGPT-Einstellungen trennen.",
    };
  });
}
export async function consumeResponseStream(response: Response) {
  if (!response.body) throw new Error("Die ChatGPT-Antwort ist leer.");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    output = "",
    completed = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let index;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const data = block
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart())
          .join("\n");
        if (!data || data === "[DONE]") continue;
        const e = JSON.parse(data);
        if (e.type === "response.output_text.delta") output += e.delta || "";
        if (output.length > 10000000)
          throw new Error("ChatGPT-Antwort ist zu umfangreich.");
        if (
          ["response.failed", "response.incomplete", "error"].includes(e.type)
        ) {
          const code = e.response?.error?.code || e.error?.code || e.code;
          throw new Error(
            code === "subscription_sharing_usage_limit_exceeded"
              ? "Dein ChatGPT-Nutzungslimit wurde erreicht. Bitte die Nutzungseinstellungen in ChatGPT prüfen."
              : code === "subscription_sharing_usage_unavailable"
                ? "Dein ChatGPT-Kontingent ist derzeit nicht verfügbar. Bitte später erneut versuchen."
                : "ChatGPT konnte die Anfrage nicht vollständig beantworten. Bitte Verbindung, Berechtigungen und Modell prüfen.",
          );
        }
        if (e.type === "response.completed") completed = true;
      }
      if (done) break;
    }
    if (!completed || !output.trim())
      throw new Error(
        "ChatGPT-Antwort wurde unterbrochen oder enthält keinen Text. Bitte erneut versuchen.",
      );
    return output;
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export function responseInput(messages: any[]) {
  return messages.map((m) => ({
    role: m.role === "system" ? "developer" : m.role,
    content:
      typeof m.content === "string"
        ? m.content
        : m.content.map((c: any) =>
            c.type === "image_url"
              ? { type: "input_image", image_url: c.image_url.url }
              : {
                  type: m.role === "assistant" ? "output_text" : "input_text",
                  text: c.text,
                },
          ),
  }));
}
export async function chatGPTAnswer(
  messages: any[],
  json: boolean,
): Promise<string | undefined> {
  const uid = context.getStore();
  if (!localChatGPTEnabled() || !uid) return undefined;
  const p = await credential(uid);
  if (!p) return undefined;
  const models = p.model ? [] : await chatGPTModels(uid);
  const model = p.model || models[0]?.id;
  if (!model)
    throw new Error("Für dieses ChatGPT-Konto ist kein Modell verfügbar.");
  const r = await fetch(resource + "/responses", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + p.accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: responseInput(messages),
      store: false,
      stream: true,
      ...(json ? { text: { format: { type: "json_object" } } } : {}),
    }),
    signal: AbortSignal.timeout(180000),
  });
  if (!r.ok)
    throw new Error(
      r.status === 429
        ? "Dein ChatGPT-Nutzungslimit wurde erreicht. Bitte die ChatGPT-Einstellungen prüfen."
        : "ChatGPT-Anfrage fehlgeschlagen. Bitte Konto erneut verbinden oder ein anderes verfügbares Modell wählen.",
    );
  return consumeResponseStream(r);
}
