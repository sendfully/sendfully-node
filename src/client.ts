import { SendfullyError } from "./http/errors";
import type { HttpMethod, RequestOptions } from "./http/request";
import { requestWithRetry } from "./http/retry";
import { sanitizeUserHeaders } from "./internal/headers";
import { buildUserAgent, isBrowser, readEnv } from "./internal/runtime";
import { ContactsResource } from "./resources/contacts";
import { EmailsResource } from "./resources/emails";
import { VERSION } from "./version";

/** Options for constructing a {@link Sendfully} client. */
export interface SendfullyClientOptions {
  /** API key. Falls back to `SENDFULLY_API_KEY`; the constructor throws if neither is set. */
  apiKey?: string;
  /** API base URL. Defaults to `https://api.sendfully.com`. */
  baseUrl?: string;
  /** Default per-request timeout in milliseconds. Defaults to 60,000. */
  timeout?: number;
  /**
   * Default retry budget for transient failures. Applies to GET/PATCH/DELETE,
   * and to POST only when `idempotencyKey` is set. Defaults to 2.
   */
  maxRetries?: number;
  /** Override the `fetch` implementation. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Extra headers sent with every request. */
  headers?: Record<string, string>;
}

const DEFAULT_BASE_URL = "https://api.sendfully.com";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 2;
const TRAILING_SLASHES = /\/+$/;

class ConstructorError extends SendfullyError {}

/**
 * Main entry point of the SDK.
 *
 * @example
 * ```ts
 * import { Sendfully } from "sendfully";
 *
 * const client = new Sendfully({ apiKey: process.env.SENDFULLY_API_KEY });
 *
 * await client.emails.send({
 *   from: "Acme <hello@acme.com>",
 *   to: "user@example.com",
 *   subject: "Hello from Acme",
 *   html: "<p>Welcome!</p>",
 * });
 * ```
 */
export class Sendfully {
  static readonly VERSION: string = VERSION;

  readonly contacts: ContactsResource;
  readonly emails: EmailsResource;

  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly staticHeaders: Record<string, string>;

  constructor(options: SendfullyClientOptions = {}) {
    if (isBrowser()) {
      throw new ConstructorError(
        "The Sendfully SDK cannot be used in a browser. Call the API from your backend instead.",
      );
    }

    const apiKey = options.apiKey ?? readEnv("SENDFULLY_API_KEY");
    if (!apiKey) {
      throw new ConstructorError(
        "Sendfully API key is required. Pass it as `new Sendfully({ apiKey })` or set the SENDFULLY_API_KEY environment variable.",
      );
    }

    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(TRAILING_SLASHES, "");
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.fetchImpl = options.fetch ?? globalThis.fetch;

    if (typeof this.fetchImpl !== "function") {
      throw new ConstructorError(
        "No `fetch` implementation available. Provide one via `new Sendfully({ fetch })` or upgrade to Node ≥20.3.",
      );
    }

    const staticHeaders = new Headers(sanitizeUserHeaders(options.headers));
    staticHeaders.set("Accept", "application/json");
    staticHeaders.set("User-Agent", buildUserAgent(VERSION));
    staticHeaders.set("Authorization", `Bearer ${apiKey}`);
    this.staticHeaders = Object.fromEntries(staticHeaders);

    this.contacts = new ContactsResource(this.request);
    this.emails = new EmailsResource(this.request);
  }

  private readonly request = async <T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> => {
    const headers = new Headers(this.staticHeaders);
    for (const [name, value] of Object.entries(sanitizeUserHeaders(options?.headers))) {
      headers.set(name, value);
    }
    if (options?.idempotencyKey !== undefined) {
      headers.set("Idempotency-Key", options.idempotencyKey);
    }

    let serializedBody: string | undefined;
    if (body !== undefined) {
      serializedBody = JSON.stringify(body);
      headers.set("Content-Type", "application/json");
    }

    return (await requestWithRetry(
      {
        url: `${this.baseUrl}${path}`,
        method,
        body: serializedBody,
        headers: Object.fromEntries(headers),
        timeout: options?.timeout ?? this.timeout,
        signal: options?.signal,
        fetch: this.fetchImpl,
        idempotencyKey: options?.idempotencyKey,
      },
      {
        maxRetries: options?.maxRetries ?? this.maxRetries,
      },
    )) as T;
  };
}
