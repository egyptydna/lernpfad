import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  beginChatGPT,
  finishChatGPT,
  chatGPTStatus,
  withAiUser,
  chatGPTAnswer,
  changeChatGPT,
  consumeResponseStream,
  responseInput,
  localOrigin,
} from "../lib/chatgpt";
function events(items: unknown[]) {
  return new Response(
    items.map((e) => "data: " + JSON.stringify(e) + "\n\n").join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}
test("SSE only accepts completed responses and rejects partial or late usage failures", async () => {
  assert.equal(
    await consumeResponseStream(
      events([
        { type: "response.output_text.delta", delta: "Hallo" },
        { type: "response.completed" },
      ]),
    ),
    "Hallo",
  );
  await assert.rejects(
    consumeResponseStream(
      events([{ type: "response.output_text.delta", delta: "Unvollständig" }]),
    ),
    /unterbrochen/,
  );
  await assert.rejects(
    consumeResponseStream(
      events([
        { type: "response.output_text.delta", delta: "Teilantwort" },
        {
          type: "response.failed",
          response: {
            error: { code: "subscription_sharing_usage_limit_exceeded" },
          },
        },
      ]),
    ),
    /Nutzungslimit/,
  );
  await assert.rejects(
    consumeResponseStream(events([{ type: "response.incomplete" }])),
    /vollständig/,
  );
});
test("Responses input converts developer instructions and vision inputs", () => {
  const input = responseInput([
    { role: "system", content: "Regeln" },
    {
      role: "user",
      content: [
        { type: "text", text: "Lies" },
        { type: "image_url", image_url: { url: "data:image/png;base64,AA==" } },
      ],
    },
  ]);
  assert.equal(input[0].role, "developer");
  assert.equal(input[1].content[1].type, "input_image");
  assert.throws(() => localOrigin("https://lernen.example.com"), /lokalen/);
  assert.throws(() => localOrigin("http://127.0.0.1.attacker.test"), /lokalen/);
});
test("real OAuth flow logic validates state, PKCE, signed identity, per-user isolation, refresh rotation and revocation", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lernpfad-chatgpt-"));
  const previousDir = process.env.DATA_DIR,
    previousEnabled = process.env.CHATGPT_LOCAL,
    originalFetch = globalThis.fetch;
  process.env.DATA_DIR = dir;
  process.env.CHATGPT_LOCAL = "true";
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const client = "oaiapp_test",
    uid = "test-user",
    email = "tutor@example.test";
  let nonce = "",
    refreshes = 0,
    inferenceCalls = 0,
    revokeCalls = 0;
  let initialToken: string;
  function token() {
    const header = Buffer.from(
      JSON.stringify({ alg: "RS256", kid: "test-key" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        iss: "https://auth.openai.com",
        aud: client,
        sub: "verified-subject",
        email,
        nonce,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url");
    return (
      header +
      "." +
      payload +
      "." +
      sign(
        "RSA-SHA256",
        Buffer.from(header + "." + payload),
        privateKey,
      ).toString("base64url")
    );
  }
  const json = (value: unknown) => Response.json(value);
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    if (url.pathname === "/.well-known/openid-configuration")
      return json({
        issuer: "https://auth.openai.com",
        jwks_uri: "https://auth.openai.com/jwks",
        revocation_endpoint: "https://auth.openai.com/revoke",
      });
    if (url.pathname === "/jwks")
      return json({
        keys: [
          {
            ...publicKey.export({ format: "jwk" }),
            kid: "test-key",
            alg: "RS256",
            use: "sig",
          },
        ],
      });
    if (url.pathname === "/api/accounts/oauth/token") {
      const form = new URLSearchParams(init.body);
      assert.equal(form.get("client_id"), client);
      assert.equal(form.get("resource"), "https://api.openai.com/v1");
      if (form.get("grant_type") === "refresh_token") {
        refreshes++;
        assert.equal(form.get("refresh_token"), "refresh-first");
      } else {
        assert.equal(
          form.get("redirect_uri"),
          "http://127.0.0.1:3000/api/chatgpt/callback",
        );
        assert.ok((form.get("code_verifier") || "").length >= 43);
      }
      return json({
        access_token: refreshes ? "access-rotated" : "access-first",
        refresh_token: refreshes ? "refresh-rotated" : "refresh-first",
        token_type: "Bearer",
        expires_in: 3600,
        id_token: initialToken || token(),
        scope:
          "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
      });
    }
    if (url.pathname === "/v1/models")
      return json({
        models: [
          {
            slug: "eligible-model",
            display_name: "Eligible model",
            visibility: "list",
          },
          { slug: "hidden", visibility: "hide" },
        ],
      });
    if (url.pathname === "/v1/responses") {
      inferenceCalls++;
      const body = JSON.parse(init.body);
      assert.equal(body.store, false);
      assert.equal(body.stream, true);
      assert.equal(body.model, "eligible-model");
      assert.ok(!("temperature" in body));
      assert.equal(body.input[0].role, "developer");
      return events([
        { type: "response.output_text.delta", delta: '{"answer":"gut"}' },
        { type: "response.completed" },
      ]);
    }
    if (url.pathname === "/revoke") {
      revokeCalls++;
      return new Response(null, { status: 200 });
    }
    throw new Error("Unexpected provider request: " + url.pathname);
  }) as typeof fetch;
  try {
    const url = new URL(await beginChatGPT(uid, "http://localhost:3000"));
    assert.equal(url.searchParams.get("client_id"), "dynamic_agent_client");
    assert.equal(url.searchParams.get("agent_name_hint"), "Lernpfad");
    nonce = url.searchParams.get("nonce")!;
    initialToken = token();
    const pendingPath = path.join(
      dir,
      "chatgpt",
      "pending-" + url.searchParams.get("state") + ".json",
    );
    const pending = JSON.parse(await fs.readFile(pendingPath, "utf8"));
    assert.equal(
      createHash("sha256").update(pending.verifier).digest("base64url"),
      url.searchParams.get("code_challenge"),
    );
    const callback = new URL(url.searchParams.get("redirect_uri")!);
    callback.search = new URLSearchParams({
      state: url.searchParams.get("state")!,
      code: "one-time-code",
      client_id: client,
    }).toString();
    assert.equal(await finishChatGPT(callback), "http://localhost:3000");
    await assert.rejects(finishChatGPT(callback), /abgelaufen|verwendet/);
    const status = await chatGPTStatus(uid);
    assert.equal(status.connected, true);
    assert.equal(status.profiles[0].email, email);
    assert.ok(!JSON.stringify(status).includes("access-first"));
    assert.equal((await chatGPTStatus("other-user")).connected, false);
    const result = await withAiUser(uid, () =>
      chatGPTAnswer(
        [
          { role: "system", content: "JSON" },
          { role: "user", content: "Aufgabe" },
        ],
        true,
      ),
    );
    assert.equal(result, '{"answer":"gut"}');
    assert.equal(
      await withAiUser("other-user", () => chatGPTAnswer([], false)),
      undefined,
    );
    const storeFile = path.join(
      dir,
      "chatgpt",
      createHash("sha256").update(uid).digest("hex") + ".json",
    );
    const store = JSON.parse(await fs.readFile(storeFile, "utf8"));
    store.profiles[0].expiresAt = 0;
    await fs.writeFile(storeFile, JSON.stringify(store));
    await Promise.all(
      [1, 2].map(() =>
        withAiUser(uid, () =>
          chatGPTAnswer([{ role: "system", content: "Regeln" }], false),
        ),
      ),
    );
    assert.equal(refreshes, 1);
    assert.equal(inferenceCalls, 3);
    assert.equal(
      JSON.parse(await fs.readFile(storeFile, "utf8")).profiles[0].refreshToken,
      "refresh-rotated",
    );
    if (process.platform !== "win32")
      assert.equal((await fs.stat(storeFile)).mode & 0o777, 0o600);
    const returning = new URL(
      await beginChatGPT(uid, "http://localhost:3000", client),
    );
    assert.equal(returning.searchParams.get("client_id"), client);
    assert.equal(returning.searchParams.has("agent_name_hint"), false);
    // A signed token with an incorrect nonce must never replace the active credentials.
    const badCallback = new URL(returning.searchParams.get("redirect_uri")!);
    badCallback.search = new URLSearchParams({
      state: returning.searchParams.get("state")!,
      code: "bad-nonce",
    }).toString();
    await assert.rejects(finishChatGPT(badCallback), /Identität/);
    assert.equal((await chatGPTStatus(uid)).connected, true);
    await changeChatGPT(uid, "disconnect");
    assert.equal(revokeCalls, 1);
    assert.equal((await chatGPTStatus(uid)).connected, false);
    const after = JSON.parse(await fs.readFile(storeFile, "utf8"));
    assert.equal(after.profiles[0].accessToken, undefined);
    assert.equal(after.profiles[0].clientId, client);
    process.env.CHATGPT_LOCAL = "false";
    await assert.rejects(
      beginChatGPT(uid, "http://localhost:3000"),
      /deaktiviert/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDir;
    if (previousEnabled === undefined) delete process.env.CHATGPT_LOCAL;
    else process.env.CHATGPT_LOCAL = previousEnabled;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
