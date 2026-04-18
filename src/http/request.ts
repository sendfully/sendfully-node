import type { ErrorEnvelope, SuccessEnvelope } from "../internal/envelope";
import {
  errorFromResponse,
  SendfullyAbortError,
  SendfullyAPIError,
  SendfullyConnectionError,
  SendfullyTimeoutError,
} from "./errors";
import { combineSignals } from "./signal";

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

/** Per-request overrides. Unset values fall back to the client defaults. */
export interface RequestOptions {
  signal?: AbortSignal;
  timeout?: number;
  maxRetries?: number;
  /** Extra headers for this request. */
  headers?: Record<string, string>;
  /**
   * Opt into server-side idempotency. Makes `POST` safe to retry: the API
   * dedupes replays for 24 hours. Without it, `POST` failures are not retried.
   */
  idempotencyKey?: string;
}

/** Callable passed to resources so they don't depend on client construction. */
export type RequestFn = <T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  options?: RequestOptions,
) => Promise<T>;

export interface RequestContext {
  url: string;
  method: HttpMethod;
  /** Already JSON-stringified by the caller. */
  body?: string;
  /** Pre-assembled with all SDK-set headers. */
  headers: Record<string, string>;
  /** Milliseconds. `undefined` disables the SDK timeout. */
  timeout?: number;
  /** Caller-supplied signal; combined with the SDK timeout inside the request. */
  signal?: AbortSignal;
  fetch: typeof fetch;
  /** Presence signals the request is safe to retry. */
  idempotencyKey?: string;
}

/**
 * Execute a single HTTP request without retry. Throws a
 * {@link SendfullyAPIError} subclass on non-2xx, or
 * {@link SendfullyConnectionError} on network or non-JSON failures.
 */
export async function performRequest<T extends SuccessEnvelope>(ctx: RequestContext): Promise<T> {
  const combined = combineSignals(ctx.timeout, ctx.signal);

  let response: Response;
  try {
    response = await ctx.fetch(ctx.url, {
      method: ctx.method,
      headers: ctx.headers,
      body: ctx.body,
      signal: combined.signal,
    });
  } catch (cause) {
    if (combined.timedOut) {
      throw new SendfullyTimeoutError(`Request to ${ctx.url} timed out`, cause);
    }
    if (ctx.signal?.aborted) {
      throw new SendfullyAbortError(`Request to ${ctx.url} was aborted`, cause);
    }
    throw new SendfullyConnectionError(`Network request to ${ctx.url} failed`, cause);
  }

  const parsed = await parseBody(response);

  if (!response.ok) {
    const errBody = normalizeErrorBody(parsed, response.status);
    throw errorFromResponse(response.status, errBody, response.headers, parsed);
  }

  // A non-JSON 2xx points to an upstream proxy rewriting the response. Fail
  // loudly rather than silently return a value with missing fields.
  if (typeof parsed === "string") {
    throw new SendfullyConnectionError(
      `Expected JSON response from ${ctx.url}, received non-JSON body`,
    );
  }

  return parsed as T;
}

/**
 * Returns the parsed JSON, `{}` for an empty body, or the raw text on non-JSON
 * so the error path can still surface a useful message.
 */
async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 500);
  }
}

function normalizeErrorBody(parsed: unknown, status: number): ErrorEnvelope {
  if (typeof parsed === "string" && parsed.length > 0) {
    return { success: false, message: parsed };
  }
  if (
    parsed !== null &&
    typeof parsed === "object" &&
    "message" in parsed &&
    typeof (parsed as { message: unknown }).message === "string"
  ) {
    const obj = parsed as { message: string; id?: unknown };
    const id = typeof obj.id === "string" ? obj.id : undefined;
    return { success: false, message: obj.message, id };
  }
  return { success: false, message: `HTTP ${status}` };
}
