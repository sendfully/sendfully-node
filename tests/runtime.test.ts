import { afterEach, describe, expect, it, vi } from "vitest";

import { Sendfully, SendfullyError } from "../src/index";
import { buildUserAgent, isBrowser, readEnv } from "../src/internal/runtime";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("readEnv", () => {
  it("reads from process.env (Node/Bun) first", () => {
    vi.stubEnv("SF_TEST_VAR", "from-process");
    expect(readEnv("SF_TEST_VAR")).toBe("from-process");
  });

  it("treats an empty-string env var as unset", () => {
    vi.stubEnv("SF_TEST_VAR", "");
    expect(readEnv("SF_TEST_VAR")).toBeUndefined();
  });

  it("falls back to Deno.env.get when process.env has no value", () => {
    vi.stubEnv("SF_TEST_VAR", "");
    vi.stubGlobal("Deno", {
      env: { get: (n: string) => (n === "SF_TEST_VAR" ? "from-deno" : undefined) },
    });
    expect(readEnv("SF_TEST_VAR")).toBe("from-deno");
  });

  it("swallows Deno permission errors and returns undefined", () => {
    vi.stubEnv("SF_TEST_VAR", "");
    vi.stubGlobal("Deno", {
      env: {
        get: () => {
          throw new Error("permission denied");
        },
      },
    });
    expect(readEnv("SF_TEST_VAR")).toBeUndefined();
  });

  it("returns undefined when no runtime exposes the variable", () => {
    vi.stubEnv("SF_TEST_VAR", "");
    expect(readEnv("SF_TEST_VAR")).toBeUndefined();
  });
});

describe("buildUserAgent", () => {
  it("reports Node by default under vitest", () => {
    // The real test process is Node, no stubbing needed.
    expect(buildUserAgent("9.9.9")).toMatch(/^sendfully-node\/9\.9\.9 node\/\d/);
  });

  it("prefers bun when process.versions.bun is present", () => {
    vi.stubGlobal("process", { versions: { bun: "1.1.0", node: "20.0.0" } });
    expect(buildUserAgent("1.2.3")).toBe("sendfully-node/1.2.3 bun/1.1.0");
  });

  it("reports deno when only Deno is available", () => {
    vi.stubGlobal("process", undefined);
    vi.stubGlobal("Deno", { version: { deno: "1.40.0" } });
    expect(buildUserAgent("1.2.3")).toBe("sendfully-node/1.2.3 deno/1.40.0");
  });

  it("falls back to a bare UA on unknown runtimes", () => {
    vi.stubGlobal("process", undefined);
    vi.stubGlobal("Deno", undefined);
    expect(buildUserAgent("1.2.3")).toBe("sendfully-node/1.2.3");
  });
});

describe("isBrowser", () => {
  it("returns false in Node", () => {
    expect(isBrowser()).toBe(false);
  });

  it("returns true when window.document is present", () => {
    vi.stubGlobal("window", { document: {} });
    expect(isBrowser()).toBe(true);
  });

  it("returns false for a service-worker-style `self` with no document", () => {
    vi.stubGlobal("window", undefined);
    expect(isBrowser()).toBe(false);
  });
});

describe("Sendfully constructor browser guard", () => {
  it("throws when instantiated in a browser-like environment", () => {
    vi.stubGlobal("window", { document: {} });
    expect(() => new Sendfully({ apiKey: "sf_k" })).toThrow(SendfullyError);
    expect(() => new Sendfully({ apiKey: "sf_k" })).toThrow(/cannot be used in a browser/);
  });
});
