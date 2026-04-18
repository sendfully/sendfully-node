import { afterEach, describe, expect, it } from "vitest";

import { Sendfully, SendfullyError } from "../src/index";
import { mockFetch } from "./helpers/mockFetch";

const originalEnv = process.env.SENDFULLY_API_KEY;

afterEach(() => {
  if (originalEnv === undefined) delete process.env.SENDFULLY_API_KEY;
  else process.env.SENDFULLY_API_KEY = originalEnv;
});

describe("Sendfully constructor", () => {
  it("throws when apiKey is missing and SENDFULLY_API_KEY is unset", () => {
    delete process.env.SENDFULLY_API_KEY;
    expect(() => new Sendfully()).toThrow(SendfullyError);
    expect(() => new Sendfully()).toThrow(/API key is required/);
  });

  it("falls back to SENDFULLY_API_KEY env var", async () => {
    process.env.SENDFULLY_API_KEY = "sf_env_key";
    const mock = mockFetch([{ body: { success: true, id: "c_1" } }]);
    const client = new Sendfully({ fetch: mock.fetch });

    await client.contacts.create({ email: "a@b.com" });
    expect(mock.calls[0]!.headers.get("authorization")).toBe("Bearer sf_env_key");
  });

  it("prefers an explicit apiKey over the env var", async () => {
    process.env.SENDFULLY_API_KEY = "sf_env";
    const mock = mockFetch([{ body: { success: true, id: "c_1" } }]);
    const client = new Sendfully({ apiKey: "sf_explicit", fetch: mock.fetch });

    await client.contacts.create({ email: "a@b.com" });
    expect(mock.calls[0]!.headers.get("authorization")).toBe("Bearer sf_explicit");
  });
});

describe("Sendfully request composition", () => {
  it("targets the default base URL", async () => {
    const mock = mockFetch([{ body: { success: true, id: "c_1" } }]);
    const client = new Sendfully({ apiKey: "sf_k", fetch: mock.fetch });

    await client.contacts.create({ email: "a@b.com" });
    expect(mock.calls[0]!.url).toBe("https://api.sendfully.com/v1/contacts");
  });

  it("honors a custom baseUrl and trims trailing slashes", async () => {
    const mock = mockFetch([{ body: { success: true, id: "c_1" } }]);
    const client = new Sendfully({
      apiKey: "sf_k",
      baseUrl: "http://localhost:3002///",
      fetch: mock.fetch,
    });

    await client.contacts.create({ email: "a@b.com" });
    expect(mock.calls[0]!.url).toBe("http://localhost:3002/v1/contacts");
  });

  it("sets Authorization, User-Agent, Accept, and Content-Type on every request", async () => {
    const mock = mockFetch([{ body: { success: true, id: "c_1" } }]);
    const client = new Sendfully({ apiKey: "sf_k", fetch: mock.fetch });

    await client.contacts.create({ email: "a@b.com" });
    const headers = mock.calls[0]!.headers;
    expect(headers.get("authorization")).toBe("Bearer sf_k");
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("user-agent")).toMatch(
      new RegExp(`^sendfully-node/${Sendfully.VERSION} node/`),
    );
  });

  it("merges default and per-request headers; Authorization cannot be overridden", async () => {
    const mock = mockFetch([{ body: { success: true, id: "c_1" } }]);
    const client = new Sendfully({
      apiKey: "sf_k",
      fetch: mock.fetch,
      headers: { "X-App": "myapp" },
    });

    await client.contacts.create(
      { email: "a@b.com" },
      { headers: { "X-Request": "abc", Authorization: "Bearer override" } },
    );
    const headers = mock.calls[0]!.headers;
    expect(headers.get("x-app")).toBe("myapp");
    expect(headers.get("x-request")).toBe("abc");
    expect(headers.get("authorization")).toBe("Bearer sf_k");
  });

  it("drops all SDK-reserved headers from caller input", async () => {
    const mock = mockFetch([{ body: { success: true, id: "e_1", status: "sent" } }]);
    const client = new Sendfully({
      apiKey: "sf_k",
      fetch: mock.fetch,
      headers: {
        accept: "text/html",
        "user-agent": "override/1.0",
      },
    });

    await client.emails.send(
      { templateId: "welcome_email_a1b2", to: "user@example.com" },
      {
        idempotencyKey: "dedicated-key",
        headers: {
          "content-type": "text/plain",
          "idempotency-key": "override-key",
          accept: "application/xml",
        },
      },
    );
    const headers = mock.calls[0]!.headers;
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("idempotency-key")).toBe("dedicated-key");
    expect(headers.get("user-agent")).toMatch(/^sendfully-node\//);
  });

  it("rejects lowercase `authorization` overrides too", async () => {
    const mock = mockFetch([{ body: { success: true, id: "c_1" } }]);
    const client = new Sendfully({
      apiKey: "sf_k",
      fetch: mock.fetch,
      headers: { authorization: "Bearer sneaky-default" },
    });

    await client.contacts.create(
      { email: "a@b.com" },
      { headers: { authorization: "Bearer sneaky-per-call" } },
    );
    expect(mock.calls[0]!.headers.get("authorization")).toBe("Bearer sf_k");
  });

  it("sets Idempotency-Key when emails.send is called with idempotencyKey", async () => {
    const mock = mockFetch([{ body: { success: true, id: "e_1", status: "sent" } }]);
    const client = new Sendfully({ apiKey: "sf_k", fetch: mock.fetch });

    await client.emails.send(
      { templateId: "welcome_email_a1b2", to: "user@example.com" },
      { idempotencyKey: "order-1234-welcome" },
    );
    expect(mock.calls[0]!.headers.get("idempotency-key")).toBe("order-1234-welcome");
  });

  it("omits Idempotency-Key when emails.send is called without idempotencyKey", async () => {
    const mock = mockFetch([{ body: { success: true, id: "e_1", status: "sent" } }]);
    const client = new Sendfully({ apiKey: "sf_k", fetch: mock.fetch });

    await client.emails.send({ templateId: "welcome_email_a1b2", to: "user@example.com" });
    expect(mock.calls[0]!.headers.get("idempotency-key")).toBeNull();
  });

  it("exposes contacts and emails resources", () => {
    const client = new Sendfully({ apiKey: "sf_k", fetch: mockFetch([]).fetch });
    expect(typeof client.contacts.create).toBe("function");
    expect(typeof client.contacts.get).toBe("function");
    expect(typeof client.contacts.update).toBe("function");
    expect(typeof client.contacts.delete).toBe("function");
    expect(typeof client.emails.send).toBe("function");
  });
});
