import { describe, expect, it } from "vitest";

import {
  errorFromResponse,
  SendfullyAbortError,
  SendfullyAPIError,
  SendfullyAuthenticationError,
  SendfullyBadRequestError,
  SendfullyConflictError,
  SendfullyConnectionError,
  SendfullyError,
  SendfullyNotFoundError,
  SendfullyPermissionError,
  SendfullyRateLimitError,
  SendfullyServerError,
  SendfullyTimeoutError,
  SendfullyUnprocessableEntityError,
} from "../src/http/errors";

const headers = (init: Record<string, string> = {}) => new Headers(init);

describe("errorFromResponse", () => {
  it.each([
    [400, SendfullyBadRequestError],
    [401, SendfullyAuthenticationError],
    [403, SendfullyPermissionError],
    [404, SendfullyNotFoundError],
    [409, SendfullyConflictError],
    [422, SendfullyUnprocessableEntityError],
    [500, SendfullyServerError],
    [502, SendfullyServerError],
    [503, SendfullyServerError],
  ])("maps status %i to %s", (status, cls) => {
    const err = errorFromResponse(status, { message: "boom" }, headers());
    expect(err).toBeInstanceOf(cls);
    expect(err).toBeInstanceOf(SendfullyAPIError);
    expect(err).toBeInstanceOf(SendfullyError);
    expect(err.status).toBe(status);
    expect(err.message).toBe("boom");
  });

  it("falls back to SendfullyAPIError for unmapped 4xx statuses", () => {
    const err = errorFromResponse(418, { message: "teapot" }, headers());
    // Not any of the specific subclasses
    expect(err).not.toBeInstanceOf(SendfullyBadRequestError);
    expect(err).not.toBeInstanceOf(SendfullyServerError);
    expect(err).toBeInstanceOf(SendfullyAPIError);
    expect(err.status).toBe(418);
  });

  it("captures the x-request-id header", () => {
    const err = errorFromResponse(404, { message: "nope" }, headers({ "x-request-id": "req_abc" }));
    expect(err.requestId).toBe("req_abc");
  });

  it("captures the optional id field from the body", () => {
    const err = errorFromResponse(500, { message: "failed", id: "email_123" }, headers());
    expect(err.id).toBe("email_123");
  });

  it("exposes the raw body verbatim, preserving fields outside the normalized envelope", () => {
    const raw = { success: false, message: "x", id: "y", custom: 1 };
    const err = errorFromResponse(400, { message: "x", id: "y" }, headers(), raw);
    expect(err.rawBody).toEqual(raw);
  });

  it("parses rate-limit headers for 429", () => {
    const err = errorFromResponse(
      429,
      { message: "slow down" },
      headers({
        "retry-after": "7",
        "ratelimit-limit": "120",
        "ratelimit-remaining": "0",
        "ratelimit-reset": "30",
      }),
    );
    expect(err).toBeInstanceOf(SendfullyRateLimitError);
    const rate = err as SendfullyRateLimitError;
    expect(rate.rateLimit).toEqual({
      retryAfter: 7,
      limit: 120,
      remaining: 0,
      reset: 30,
    });
  });

  it("handles missing rate-limit headers gracefully", () => {
    const err = errorFromResponse(
      429,
      { message: "slow down" },
      headers(),
    ) as SendfullyRateLimitError;
    expect(err.rateLimit).toEqual({
      retryAfter: undefined,
      limit: undefined,
      remaining: undefined,
      reset: undefined,
    });
  });
});

describe("error class metadata", () => {
  it("sets error.name to the subclass name", () => {
    const err = errorFromResponse(404, { message: "x" }, headers());
    expect(err.name).toBe("SendfullyNotFoundError");
  });

  it("SendfullyTimeoutError is a SendfullyConnectionError", () => {
    const err = new SendfullyTimeoutError("timed out");
    expect(err).toBeInstanceOf(SendfullyConnectionError);
    expect(err).toBeInstanceOf(SendfullyError);
    expect(err.name).toBe("SendfullyTimeoutError");
  });

  it("SendfullyConnectionError exposes cause via ES2022 Error.cause", () => {
    const inner = new Error("socket hang up");
    const err = new SendfullyConnectionError("connection failed", inner);
    expect(err.cause).toBe(inner);
  });

  it("SendfullyAbortError is a SendfullyError but not a connection error", () => {
    const err = new SendfullyAbortError("aborted");
    expect(err).toBeInstanceOf(SendfullyError);
    expect(err).not.toBeInstanceOf(SendfullyConnectionError);
    expect(err.name).toBe("SendfullyAbortError");
  });

  it("SendfullyAbortError exposes cause via ES2022 Error.cause", () => {
    const inner = new Error("aborted by caller");
    const err = new SendfullyAbortError("aborted", inner);
    expect(err.cause).toBe(inner);
  });
});
