const HOST_PATTERN = /^[a-z0-9.-]+(:\d{1,5})?$/i;

// Exact app deployments, not an allowance for other tenants on either service.
const PUBLIC_PROXY_ORIGINS = new Set([
  "https://sports-brand-collaboration-setup.vercel.app",
  "https://sports-brand-collaboration-setup.v0.build",
]);

function singleValue(header: string | null): string | null {
  if (!header || header.includes(",") || /\s/.test(header)) return null;
  return header.toLowerCase();
}

function originFor(protocol: string, host: string): string | null {
  if ((protocol !== "http" && protocol !== "https") || !HOST_PATTERN.test(host)) return null;
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return null;
  }
}

/**
 * Keep the framework request URL as the ordinary same-origin boundary. The
 * known preview proxies may expose an internal request URL, so additionally
 * recognize only our exact public HTTPS deployments when the request headers
 * identify one of them. Forwarded headers alone never establish trust in a new
 * origin: other proxies must preserve the public request URL. Do not combine
 * internal/public protocols or take the first entry of ambiguous header lists.
 */
export function trustedOrigins(request: Request): Set<string> {
  const url = new URL(request.url);
  const origins = new Set<string>();
  if (url.protocol !== "http:" && url.protocol !== "https:") return origins;
  origins.add(url.origin);
  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  const protocol = forwardedProtocol === null
    ? url.protocol.slice(0, -1)
    : singleValue(forwardedProtocol);
  if (protocol !== "http" && protocol !== "https") return origins;
  for (const header of ["x-forwarded-host", "host"]) {
    const host = singleValue(request.headers.get(header));
    if (!host) continue;
    const origin = originFor(protocol, host);
    if (origin && PUBLIC_PROXY_ORIGINS.has(origin)) origins.add(origin);
  }
  return origins;
}

export function isTrustedOrigin(request: Request, origin: string | null): boolean {
  return origin !== null && trustedOrigins(request).has(origin);
}

/** Missing Origin stays compatible with non-browser callers; a present one must match. */
export function isSameOriginWrite(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin === null || isTrustedOrigin(request, origin);
}
