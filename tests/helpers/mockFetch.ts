export interface MockResponse {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
  /** If set, the mock throws this instead of returning a Response. */
  throw?: unknown;
}

export interface CapturedCall {
  url: string;
  method: string;
  headers: Headers;
  body: string | undefined;
  signal: AbortSignal | undefined;
}

export interface MockFetch {
  fetch: typeof fetch;
  calls: CapturedCall[];
}

type MockResponseOrFn = MockResponse | ((req: CapturedCall) => MockResponse);

export function mockFetch(responses: MockResponseOrFn[]): MockFetch {
  const queue = [...responses];
  const calls: CapturedCall[] = [];

  const fn: typeof fetch = async (input, init) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? init.body : undefined;
    const signal = init?.signal ?? undefined;
    const call: CapturedCall = { url, method, headers, body, signal };
    calls.push(call);

    const next = queue.shift();
    if (!next) {
      throw new Error(`mockFetch: unexpected request to ${method} ${url}`);
    }
    const resolved = typeof next === "function" ? next(call) : next;

    if (resolved.throw !== undefined) {
      throw resolved.throw;
    }

    const responseBody = resolved.body === undefined ? "" : JSON.stringify(resolved.body);
    return new Response(responseBody, {
      status: resolved.status ?? 200,
      headers: {
        "content-type": "application/json",
        ...(resolved.headers ?? {}),
      },
    });
  };

  return { fetch: fn, calls };
}
