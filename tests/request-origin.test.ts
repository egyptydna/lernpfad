import test from "node:test";
import assert from "node:assert/strict";
import {
  allowedRequestOrigin,
  codespaceOrigin,
} from "../lib/request-origin.mjs";
const name = "curly-space-barnacle-example";
const external = `https://${name}-3000.app.github.dev`;
const proxy = {
  requestURL: "http://localhost:3000/api/auth/register",
  host: "localhost:3000",
  forwardedHost: `${name}-3000.app.github.dev`,
  env: { CODESPACE_NAME: name, APP_ORIGIN: external },
};
test("Codespaces registration accepts its public HTTPS origin behind an HTTP proxy", () => {
  assert.equal(allowedRequestOrigin({ ...proxy, origin: external }), true);
  assert.equal(
    allowedRequestOrigin({
      ...proxy,
      origin: external,
      env: { ...proxy.env, APP_ORIGIN: "https://different-config.example" },
    }),
    true,
  );
});
test("proxy-rewritten loopback origins require the exact Codespace forwarded host", () => {
  assert.equal(
    allowedRequestOrigin({ ...proxy, origin: "http://localhost:3000" }),
    true,
  );
  assert.equal(
    allowedRequestOrigin({ ...proxy, origin: "http://127.0.0.1:3000" }),
    true,
  );
  assert.equal(
    allowedRequestOrigin({
      ...proxy,
      origin: "http://localhost:3000",
      forwardedHost: "attacker.app.github.dev",
    }),
    false,
  );
  assert.equal(
    allowedRequestOrigin({ ...proxy, origin: "http://localhost:3001" }),
    false,
  );
});
test("other Codespaces, foreign sites, null origins and lookalike domains remain blocked", () => {
  for (const origin of [
    "https://foreign.example",
    "https://other-3000.app.github.dev",
    `http://${name}-3000.app.github.dev`,
    external + ".attacker.test",
    "null",
    external + "/path",
  ])
    assert.equal(allowedRequestOrigin({ ...proxy, origin }), false);
});
test("ordinary installations do not trust arbitrary forwarded hosts", () => {
  const local = {
    requestURL: "http://localhost:3000/api/auth/register",
    host: "localhost:3000",
    forwardedHost: "attacker.test",
    env: {},
  };
  assert.equal(
    allowedRequestOrigin({ ...local, origin: "http://localhost:3000" }),
    true,
  );
  assert.equal(
    allowedRequestOrigin({ ...local, origin: "https://attacker.test" }),
    false,
  );
  assert.equal(
    allowedRequestOrigin({ ...local, origin: "https://localhost:3000" }),
    false,
  );
  assert.equal(allowedRequestOrigin({ ...local, origin: null }), true);
});
test("Codespaces helper produces only validated exact hostnames", () => {
  assert.equal(codespaceOrigin({ CODESPACE_NAME: name }), external);
  assert.equal(codespaceOrigin({ CODESPACE_NAME: "invalid/name" }), undefined);
  assert.equal(
    codespaceOrigin({
      CODESPACE_NAME: name,
      GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev/path",
    }),
    undefined,
  );
});
