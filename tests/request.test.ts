import { describe, expect, it } from "vitest";

import {
  SendfullyAbortError,
  SendfullyBadRequestError,
  SendfullyConflictError,
  SendfullyConnectionError,
  SendfullyNotFoundError,
  SendfullyServerError,
  SendfullyTimeoutError,
} from "../src/http/errors";
import { performRequest } from "../src/http/request";
import { mockFetch } from "./helpers/mockFetch";

const baseCtx = (overrides: Partial<Parameters<typeof performRequest>[0]>) => {
  const defaults = {
    url: "https://api.sendfully.com/v1/contacts/abc",
    method: "GET" as const,
    headers: { Authorization: "Bearer sf_test" },
    fetch: mockFetch([{ body: { success: true, data: { id: "abc" } } }]).fetch,
  };
  return { ...defaults, ...overrides };
};

describe("performRequest", () => {
  it("returns the parsed envelope on 2xx", async () => {
    const mock = mockFetch([{ body: { success: true, data: { id: "abc" } } }]);
    const result = await performRequest(baseCtx({ fetch: mock.fetch }));
    expect(result).toEqual({ success: true, data: { id: "abc" } });
  });

  it("forwards request headers verbatim", async () => {
    const mock = mockFetch([{ body: { success: true } }]);
    await performRequest(
      baseCtx({
        fetch: mock.fetch,
        headers: { Authorization: "Bearer sf_abc", "X-Test": "yes" },
      }),
    );
    expect(mock.calls[0]!.headers.get("authorization")).toBe("Bearer sf_abc");
    expect(mock.calls[0]!.headers.get("x-test")).toBe("yes");
  });

  it("sends the pre-serialized body verbatim", async () => {
    const mock = mockFetch([{ body: { success: true } }]);
    await performRequest(
      baseCtx({
        fetch: mock.fetch,
        method: "POST",
        body: '{"email":"a@b.com"}',
      }),
    );
    expect(mock.calls[0]!.body).toBe('{"email":"a@b.com"}');
  });

  it("throws SendfullyNotFoundError on 404", async () => {
    const mock = mockFetch([{ status: 404, body: { success: false, message: "not found" } }]);
    await expect(performRequest(baseCtx({ fetch: mock.fetch }))).rejects.toBeInstanceOf(
      SendfullyNotFoundError,
    );
  });

  it.each([
    [400, SendfullyBadRequestError],
    [409, SendfullyConflictError],
    [500, SendfullyServerError],
  ])("maps %i to %s", async (status, cls) => {
    const mock = mockFetch([{ status, body: { success: false, message: "x" } }]);
    await expect(performRequest(baseCtx({ fetch: mock.fetch }))).rejects.toBeInstanceOf(cls);
  });

  it("captures error id from the body", async () => {
    const mock = mockFetch([
      { status: 500, body: { success: false, message: "failed to send", id: "email_42" } },
    ]);
    await expect(performRequest(baseCtx({ fetch: mock.fetch }))).rejects.toMatchObject({
      id: "email_42",
      message: "failed to send",
    });
  });

  it("exposes the full parsed response body as rawBody on errors", async () => {
    const raw = {
      success: false,
      message: "bad input",
      details: [{ field: "email", reason: "invalid" }],
    };
    const mock = mockFetch([{ status: 400, body: raw }]);
    await expect(performRequest(baseCtx({ fetch: mock.fetch }))).rejects.toMatchObject({
      rawBody: raw,
    });
  });

  it("captures x-request-id on errors", async () => {
    const mock = mockFetch([
      {
        status: 404,
        headers: { "x-request-id": "req_abc" },
        body: { success: false, message: "no" },
      },
    ]);
    await expect(performRequest(baseCtx({ fetch: mock.fetch }))).rejects.toMatchObject({
      requestId: "req_abc",
    });
  });

  it("wraps network errors in SendfullyConnectionError", async () => {
    const cause = new Error("ECONNRESET");
    const mock = mockFetch([{ throw: cause }]);
    try {
      await performRequest(baseCtx({ fetch: mock.fetch }));
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SendfullyConnectionError);
      expect(err).not.toBeInstanceOf(SendfullyTimeoutError);
      expect((err as Error).cause).toBe(cause);
    }
  });

  it("throws SendfullyTimeoutError when the SDK timeout fires", async () => {
    const mock = {
      calls: [] as unknown[],
      fetch: (async (_url: string, init?: RequestInit) => {
        const signal = init?.signal;
        await new Promise<void>((resolve, reject) => {
          if (!signal) return resolve();
          if (signal.aborted) {
            const err = new Error("aborted");
            err.name = "AbortError";
            return reject(err);
          }
          signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
        throw new Error("unreachable");
      }) as unknown as typeof fetch,
    };
    await expect(performRequest(baseCtx({ fetch: mock.fetch, timeout: 5 }))).rejects.toBeInstanceOf(
      SendfullyTimeoutError,
    );
  });

  it("throws SendfullyAbortError when the caller's signal aborts", async () => {
    const controller = new AbortController();
    const mock = {
      fetch: (async (_url: string, init?: RequestInit) => {
        const signal = init?.signal;
        await new Promise<void>((_resolve, reject) => {
          if (!signal) return;
          if (signal.aborted) {
            const err = new Error("aborted");
            err.name = "AbortError";
            return reject(err);
          }
          signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
        throw new Error("unreachable");
      }) as unknown as typeof fetch,
    };
    queueMicrotask(() => controller.abort());
    await expect(
      performRequest(baseCtx({ fetch: mock.fetch, signal: controller.signal })),
    ).rejects.toBeInstanceOf(SendfullyAbortError);
  });

  it("falls back to HTTP <status> when the error body is not JSON", async () => {
    const mock = {
      fetch: (async () =>
        new Response("<html>500 internal</html>", {
          status: 500,
          headers: { "content-type": "text/html" },
        })) as unknown as typeof fetch,
    };
    await expect(performRequest(baseCtx({ fetch: mock.fetch }))).rejects.toBeInstanceOf(
      SendfullyServerError,
    );
  });

  it("throws SendfullyConnectionError on a 2xx with a non-JSON body", async () => {
    // An upstream proxy injecting HTML into a 200 would otherwise silently
    // surface as an object with missing fields. Fail loudly instead.
    const mock = {
      fetch: (async () =>
        new Response("<html>hello</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        })) as unknown as typeof fetch,
    };
    await expect(performRequest(baseCtx({ fetch: mock.fetch }))).rejects.toBeInstanceOf(
      SendfullyConnectionError,
    );
  });
});
