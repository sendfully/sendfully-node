const RESERVED_HEADERS = new Set([
  "authorization",
  "accept",
  "user-agent",
  "content-type",
  "idempotency-key",
]);

/** Drop reserved headers from caller-supplied input. */
export function sanitizeUserHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (RESERVED_HEADERS.has(name.toLowerCase())) continue;
    out[name] = value;
  }
  return out;
}
