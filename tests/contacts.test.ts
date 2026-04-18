import { describe, expect, it } from "vitest";

import { SendfullyConflictError, SendfullyNotFoundError } from "../src/http/errors";
import { ContactsResource } from "../src/resources/contacts";
import { makeFakeRequest, makeThrowingRequest } from "./helpers/fakeRequest";

describe("ContactsResource", () => {
  it("create POSTs to /v1/contacts and returns the id", async () => {
    const { request, calls } = makeFakeRequest({ success: true, id: "c_123" });
    const contacts = new ContactsResource(request);

    const result = await contacts.create({ email: "a@b.com", firstName: "A" });

    expect(result).toEqual({ id: "c_123" });
    expect(calls).toEqual([
      {
        method: "POST",
        path: "/v1/contacts",
        body: { email: "a@b.com", firstName: "A" },
        options: undefined,
      },
    ]);
  });

  it("create surfaces 409 as SendfullyConflictError", async () => {
    const request = makeThrowingRequest(
      new SendfullyConflictError({ message: "exists", status: 409 }),
    );
    const contacts = new ContactsResource(request);
    await expect(contacts.create({ email: "dupe@x.com" })).rejects.toBeInstanceOf(
      SendfullyConflictError,
    );
  });

  it("get unwraps the envelope to return data directly", async () => {
    const { request, calls } = makeFakeRequest({
      success: true,
      data: {
        id: "c_1",
        email: "a@b.com",
        firstName: null,
        lastName: null,
        subscribed: true,
        suppressed: false,
        suppressionReason: null,
        suppressedAt: null,
        createdAt: "2026-01-01T00:00:00Z",
      },
    });
    const contacts = new ContactsResource(request);

    const contact = await contacts.get("c_1");
    expect(contact.id).toBe("c_1");
    expect(contact.email).toBe("a@b.com");
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.path).toBe("/v1/contacts/c_1");
  });

  it("get URL-encodes email identifiers (including + aliases)", async () => {
    const { request, calls } = makeFakeRequest({
      success: true,
      data: {
        id: "c_2",
        email: "foo+bar@example.com",
        firstName: null,
        lastName: null,
        subscribed: true,
        suppressed: false,
        suppressionReason: null,
        suppressedAt: null,
        createdAt: "2026-01-01T00:00:00Z",
      },
    });
    const contacts = new ContactsResource(request);

    await contacts.get("foo+bar@example.com");
    expect(calls[0]!.path).toBe("/v1/contacts/foo%2Bbar%40example.com");
  });

  it("get surfaces 404 as SendfullyNotFoundError", async () => {
    const request = makeThrowingRequest(
      new SendfullyNotFoundError({ message: "not found", status: 404 }),
    );
    const contacts = new ContactsResource(request);
    await expect(contacts.get("missing@x.com")).rejects.toBeInstanceOf(SendfullyNotFoundError);
  });

  it("update PATCHes and resolves with void", async () => {
    const { request, calls } = makeFakeRequest({ success: true });
    const contacts = new ContactsResource(request);

    await expect(contacts.update("a@b.com", { subscribed: false })).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({
      method: "PATCH",
      path: "/v1/contacts/a%40b.com",
      body: { subscribed: false },
    });
  });

  it("delete DELETEs and resolves with void", async () => {
    const { request, calls } = makeFakeRequest({ success: true });
    const contacts = new ContactsResource(request);

    await expect(contacts.delete("c_1")).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({ method: "DELETE", path: "/v1/contacts/c_1" });
  });

  it("forwards RequestOptions to the underlying request", async () => {
    const { request, calls } = makeFakeRequest({ success: true, id: "c_1" });
    const contacts = new ContactsResource(request);
    const signal = new AbortController().signal;
    await contacts.create(
      { email: "a@b.com" },
      { signal, timeout: 5000, maxRetries: 0, headers: { "X-Test": "1" } },
    );
    expect(calls[0]!.options).toEqual({
      signal,
      timeout: 5000,
      maxRetries: 0,
      headers: { "X-Test": "1" },
    });
  });
});
