import { describe, expect, it, vi } from "vitest";

import {
  SendfullyConnectionError,
  SendfullyRateLimitError,
  SendfullyServerError,
} from "../src/http/errors";
import { requestWithRetry } from "../src/http/retry";
import { mockFetch } from "./helpers/mockFetch";

const baseCtx = (
  fetch: typeof globalThis.fetch,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
) => ({
  url: "https://api.sendfully.com/v1/contacts/abc",
  method,
  headers: { Authorization: "Bearer sf_test" },
  fetch,
});

describe("requestWithRetry", () => {
  it("retries a GET that fails with 5xx and succeeds on the final attempt", async () => {
    const mock = mockFetch([
      { status: 500, body: { success: false, message: "boom" } },
      { status: 502, body: { success: false, message: "boom" } },
      { body: { success: true, data: { id: "abc" } } },
    ]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await requestWithRetry(baseCtx(mock.fetch), { maxRetries: 2, sleep });
    expect(result).toEqual({ success: true, data: { id: "abc" } });
    expect(mock.calls).toHaveLength(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries", async () => {
    const mock = mockFetch(
      Array.from({ length: 3 }, () => ({
        status: 503,
        body: { success: false, message: "nope" },
      })),
    );
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      requestWithRetry(baseCtx(mock.fetch), { maxRetries: 2, sleep }),
    ).rejects.toBeInstanceOf(SendfullyServerError);
    expect(mock.calls).toHaveLength(3);
  });

  it("does NOT retry a POST without an idempotencyKey, even on a 500", async () => {
    const mock = mockFetch([{ status: 500, body: { success: false, message: "boom" } }]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      requestWithRetry(baseCtx(mock.fetch, "POST"), { maxRetries: 5, sleep }),
    ).rejects.toBeInstanceOf(SendfullyServerError);
    expect(mock.calls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries a POST with an idempotencyKey on a 5xx", async () => {
    const mock = mockFetch([
      { status: 500, body: { success: false, message: "boom" } },
      { status: 502, body: { success: false, message: "boom" } },
      { body: { success: true, id: "e_1", status: "sent" } },
    ]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await requestWithRetry(
      { ...baseCtx(mock.fetch, "POST"), idempotencyKey: "key-abc" },
      { maxRetries: 2, sleep },
    );
    expect(result).toEqual({ success: true, id: "e_1", status: "sent" });
    expect(mock.calls).toHaveLength(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("retries a POST with an idempotencyKey on a network error", async () => {
    const mock = mockFetch([
      { throw: new Error("ECONNRESET") },
      { body: { success: true, id: "e_2", status: "sent" } },
    ]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await requestWithRetry(
      { ...baseCtx(mock.fetch, "POST"), idempotencyKey: "key-abc" },
      { maxRetries: 2, sleep },
    );
    expect(result).toEqual({ success: true, id: "e_2", status: "sent" });
    expect(mock.calls).toHaveLength(2);
  });

  it("does NOT retry on a 400", async () => {
    const mock = mockFetch([{ status: 400, body: { success: false, message: "bad" } }]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      requestWithRetry(baseCtx(mock.fetch), { maxRetries: 3, sleep }),
    ).rejects.toMatchObject({ status: 400 });
    expect(mock.calls).toHaveLength(1);
  });

  it("retries on a connection error", async () => {
    const mock = mockFetch([
      { throw: new Error("ECONNRESET") },
      { body: { success: true, data: { id: "ok" } } },
    ]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await requestWithRetry(baseCtx(mock.fetch), { maxRetries: 2, sleep });
    expect(result).toEqual({ success: true, data: { id: "ok" } });
    expect(mock.calls).toHaveLength(2);
  });

  it("retries on a 429 and honors Retry-After", async () => {
    const mock = mockFetch([
      {
        status: 429,
        headers: { "retry-after": "3" },
        body: { success: false, message: "slow down" },
      },
      { body: { success: true, data: {} } },
    ]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    await requestWithRetry(baseCtx(mock.fetch), { maxRetries: 2, sleep });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it("surfaces the rate limit error when retries are exhausted", async () => {
    const mock = mockFetch([
      { status: 429, body: { success: false, message: "slow" } },
      { status: 429, body: { success: false, message: "slow" } },
    ]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      requestWithRetry(baseCtx(mock.fetch), { maxRetries: 1, sleep }),
    ).rejects.toBeInstanceOf(SendfullyRateLimitError);
  });

  it("uses maxRetries=0 to disable retries", async () => {
    const mock = mockFetch([{ throw: new Error("fail") }]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      requestWithRetry(baseCtx(mock.fetch), { maxRetries: 0, sleep }),
    ).rejects.toBeInstanceOf(SendfullyConnectionError);
    expect(mock.calls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("caps Retry-After to 60s to avoid stalling on a misbehaving server", async () => {
    const mock = mockFetch([
      {
        status: 429,
        headers: { "retry-after": "86400" },
        body: { success: false, message: "slow down" },
      },
      { body: { success: true, data: {} } },
    ]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    await requestWithRetry(baseCtx(mock.fetch), { maxRetries: 1, sleep });
    expect(sleep).toHaveBeenCalledWith(60_000);
  });

  it("aborts mid-backoff when the caller's signal fires", async () => {
    const mock = mockFetch([
      { throw: new Error("ECONNRESET") },
      { body: { success: true, data: {} } },
    ]);
    const controller = new AbortController();
    // Sleep that resolves slowly enough for the abort to win the race.
    const sleep = (_ms: number): Promise<void> =>
      new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    const promise = requestWithRetry(
      { ...baseCtx(mock.fetch), signal: controller.signal },
      { maxRetries: 1, sleep },
    );
    queueMicrotask(() => controller.abort());
    await expect(promise).rejects.toBeInstanceOf(SendfullyConnectionError);
    expect(mock.calls).toHaveLength(1);
  });

  it("clears the default backoff timer on abort so the event loop isn't held open", async () => {
    vi.useFakeTimers();
    try {
      const mock = mockFetch([
        { throw: new Error("ECONNRESET") },
        { body: { success: true, data: {} } },
      ]);
      const controller = new AbortController();
      const promise = requestWithRetry(
        { ...baseCtx(mock.fetch), signal: controller.signal },
        { maxRetries: 1 },
      );
      // Drain microtasks so the first attempt rejects and the backoff timer is scheduled.
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      controller.abort();
      await expect(promise).rejects.toBeInstanceOf(SendfullyConnectionError);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
