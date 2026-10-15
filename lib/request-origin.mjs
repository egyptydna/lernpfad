/** @param {Record<string, string | undefined>} env */
export function codespaceOrigin(env = process.env) {
  const name = env.CODESPACE_NAME;
  const domain =
    env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || "app.github.dev";
  if (!name || !/^[a-z0-9-]+$/i.test(name) || !/^[a-z0-9.-]+$/i.test(domain))
    return undefined;
  return `https://${name}-3000.${domain}`;
}
/**
 * Only trust the current Codespace's exact hosts, never arbitrary forwarded headers.
 * @param {{ origin: string | null, requestURL: string, host: string | null, forwardedHost?: string | null, env?: Record<string, string | undefined> }} input
 */
export function allowedRequestOrigin({
  origin,
  requestURL,
  host,
  forwardedHost,
  env = process.env,
}) {
  if (!origin) return true;
  let request, incoming;
  try {
    request = new URL(requestURL);
    incoming = new URL(origin);
    if (incoming.origin !== origin || incoming.username || incoming.password)
      return false;
  } catch {
    return false;
  }
  const expected =
    env.APP_ORIGIN?.trim() || `${request.protocol}//${host || request.host}`;
  if (origin === expected) return true;
  const primary = codespaceOrigin(env);
  if (!primary) return false;
  // GitHub's forwarded domain can vary by environment; also recognize the standard
  // host for this same Codespace. No other Codespace or subdomain is authorized.
  const publicOrigins = new Set([
    primary,
    `https://${env.CODESPACE_NAME}-3000.app.github.dev`,
  ]);
  if (publicOrigins.has(origin)) return true;
  const proxyHost = (forwardedHost || host || "").trim().toLowerCase();
  const trustedProxy = [...publicOrigins].some(
    (o) => new URL(o).host.toLowerCase() === proxyHost,
  );
  // A forwarding proxy may rewrite Origin to the internal HTTP endpoint.
  // Accept that only when its forwarded host identifies this exact Codespace.
  return (
    trustedProxy &&
    incoming.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(incoming.hostname) &&
    incoming.port === "3000"
  );
}
