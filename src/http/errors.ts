/** Base class for every error thrown by this SDK. Use `instanceof` as a catch-all. */
export abstract class SendfullyError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    // Set `error.name` to the subclass name.
    this.name = new.target.name;
  }
}

/** Thrown when the request never got a response (DNS, connection reset, TLS, etc). */
export class SendfullyConnectionError extends SendfullyError {}

/** Thrown when the SDK's own timeout fires. Caller aborts throw {@link SendfullyAbortError}. */
export class SendfullyTimeoutError extends SendfullyConnectionError {}

/** Thrown when the caller's `AbortSignal` aborts the request, kept distinct from timeouts. */
export class SendfullyAbortError extends SendfullyError {}

/** Parsed error response. Server contract: `{ success: false, message, id? }`. */
export interface SendfullyErrorBody {
  message: string;
  id?: string;
}

export interface SendfullyRateLimitInfo {
  /** Seconds the caller should wait before retrying, from the `Retry-After` header. */
  retryAfter?: number;
  /** Request limit for the current window, from `RateLimit-Limit`. */
  limit?: number;
  /** Requests remaining in the current window, from `RateLimit-Remaining`. */
  remaining?: number;
  /** Seconds until the window resets, from `RateLimit-Reset`. */
  reset?: number;
}

export interface SendfullyAPIErrorOptions {
  message: string;
  status: number;
  requestId?: string;
  id?: string;
  rawBody?: unknown;
}

/**
 * Thrown on any non-2xx response. A specific subclass (e.g.
 * {@link SendfullyNotFoundError}) is used when available, with this as the fallback.
 */
export class SendfullyAPIError extends SendfullyError {
  readonly status: number;

  readonly requestId?: string;

  /** Some endpoints (e.g. email send) return an `id` on errors to correlate with a persisted record. */
  readonly id?: string;

  /** Parsed response body as returned by the server. */
  readonly rawBody?: unknown;

  constructor(opts: SendfullyAPIErrorOptions) {
    super(opts.message);
    this.status = opts.status;
    this.requestId = opts.requestId;
    this.id = opts.id;
    this.rawBody = opts.rawBody;
  }
}

/** 400: malformed request or invalid parameters. */
export class SendfullyBadRequestError extends SendfullyAPIError {}

/** 401: missing or invalid API key. */
export class SendfullyAuthenticationError extends SendfullyAPIError {}

/** 403: the API key is valid but lacks permission for this action. */
export class SendfullyPermissionError extends SendfullyAPIError {}

/** 404: the requested resource does not exist. */
export class SendfullyNotFoundError extends SendfullyAPIError {}

/** 409: the request conflicts with existing state (e.g. duplicate contact). */
export class SendfullyConflictError extends SendfullyAPIError {}

/** 422: the request was well-formed but failed semantic validation. */
export class SendfullyUnprocessableEntityError extends SendfullyAPIError {}

/** 429: the caller has been rate limited. */
export class SendfullyRateLimitError extends SendfullyAPIError {
  /** Rate-limit metadata parsed from response headers. */
  readonly rateLimit: SendfullyRateLimitInfo;

  constructor(opts: SendfullyAPIErrorOptions & { rateLimit: SendfullyRateLimitInfo }) {
    super(opts);
    this.rateLimit = opts.rateLimit;
  }
}

/** 5xx: the server failed to process the request. */
export class SendfullyServerError extends SendfullyAPIError {}

/** Map a status code to the most specific error subclass; unmapped statuses fall back. */
export function errorFromResponse(
  status: number,
  body: SendfullyErrorBody,
  headers: Headers,
  rawBody?: unknown,
): SendfullyAPIError {
  const requestId = headers.get("x-request-id") ?? undefined;
  const opts: SendfullyAPIErrorOptions = {
    message: body.message,
    status,
    requestId,
    id: body.id,
    rawBody,
  };

  switch (status) {
    case 400:
      return new SendfullyBadRequestError(opts);
    case 401:
      return new SendfullyAuthenticationError(opts);
    case 403:
      return new SendfullyPermissionError(opts);
    case 404:
      return new SendfullyNotFoundError(opts);
    case 409:
      return new SendfullyConflictError(opts);
    case 422:
      return new SendfullyUnprocessableEntityError(opts);
    case 429:
      return new SendfullyRateLimitError({
        ...opts,
        rateLimit: parseRateLimit(headers),
      });
    default:
      if (status >= 500) return new SendfullyServerError(opts);
      return new SendfullyAPIError(opts);
  }
}

function parseRateLimit(headers: Headers): SendfullyRateLimitInfo {
  return {
    retryAfter: parseIntHeader(headers.get("retry-after")),
    limit: parseIntHeader(headers.get("ratelimit-limit")),
    remaining: parseIntHeader(headers.get("ratelimit-remaining")),
    reset: parseIntHeader(headers.get("ratelimit-reset")),
  };
}

function parseIntHeader(value: string | null): number | undefined {
  if (value == null) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}
