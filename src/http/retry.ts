import type { SuccessEnvelope } from "../internal/envelope";
import {
  SendfullyConnectionError,
  SendfullyError,
  SendfullyRateLimitError,
  SendfullyServerError,
} from "./errors";
import { performRequest, type RequestContext } from "./request";

/** Parameters controlling retry behavior for a single request. */
export interface RetryConfig {
  /** Max retries on transient failures. Total attempts are `maxRetries + 1`. */
  maxRetries: number;
  /**
   * Scheduler used for delays.
   */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const DEFAULT_SLEEP = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8_000;
const MAX_RETRY_AFTER_MS = 60_000;

/**
 * Execute a request with retries on transient failures. GET/PATCH/DELETE are
 * always eligible; POST only retries when an `idempotencyKey` is supplied,
 * since otherwise a replay could duplicate server-side side effects.
 */
export async function requestWithRetry<T extends SuccessEnvelope>(
  ctx: RequestContext,
  config: RetryConfig,
): Promise<T> {
  const sleep = config.sleep ?? DEFAULT_SLEEP;
  const maxAttempts = Math.max(1, config.maxRetries + 1);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await performRequest<T>(ctx);
    } catch (err) {
      const isFinalAttempt = attempt === maxAttempts - 1;
      if (isFinalAttempt || !isRetryable(ctx, err)) {
        throw err;
      }
      const aborted = await sleepOrAbort(computeBackoff(attempt, err), ctx.signal, sleep);
      if (aborted) throw err;
    }
  }

  throw new Error("Retry loop exited unexpectedly");
}

function isRetryable(ctx: RequestContext, err: unknown): boolean {
  // POST retries need an Idempotency-Key so the server can dedupe the replay.
  if (ctx.method === "POST" && ctx.idempotencyKey === undefined) return false;
  if (!(err instanceof SendfullyError)) return false;
  return (
    err instanceof SendfullyConnectionError ||
    err instanceof SendfullyServerError ||
    err instanceof SendfullyRateLimitError
  );
}

function computeBackoff(attempt: number, err: unknown): number {
  // Honor Retry-After on 429s.
  if (err instanceof SendfullyRateLimitError && err.rateLimit.retryAfter !== undefined) {
    return Math.min(MAX_RETRY_AFTER_MS, err.rateLimit.retryAfter * 1000);
  }
  // Exponential backoff with jitter.
  const ceiling = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
  return Math.floor(Math.random() * ceiling);
}

/** Sleep `ms`, resolving early on abort. Returns true if aborted, false if completed. */
async function sleepOrAbort(
  ms: number,
  signal: AbortSignal | undefined,
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>,
): Promise<boolean> {
  if (!signal) {
    await sleep(ms);
    return false;
  }
  if (signal.aborted) return true;
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<true>((resolve) => {
    onAbort = () => resolve(true);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([sleep(ms, signal).then(() => false as const), aborted]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}
