interface ProcessLike {
  env?: Record<string, string | undefined>;
  versions?: { node?: string; bun?: string };
}

interface DenoLike {
  env?: { get(name: string): string | undefined };
  version?: { deno?: string };
}

function getProcess(): ProcessLike | undefined {
  return (globalThis as { process?: ProcessLike }).process;
}

function getDeno(): DenoLike | undefined {
  return (globalThis as { Deno?: DenoLike }).Deno;
}

export function readEnv(name: string): string | undefined {
  const fromProcess = getProcess()?.env?.[name];
  if (fromProcess && fromProcess.length > 0) return fromProcess;

  // Deno throws without `--allow-env`; treat that the same as unset.
  try {
    const fromDeno = getDeno()?.env?.get(name);
    if (fromDeno && fromDeno.length > 0) return fromDeno;
  } catch {}
  return undefined;
}

export function buildUserAgent(sdkVersion: string): string {
  const proc = getProcess();
  if (proc?.versions?.bun) return `sendfully-node/${sdkVersion} bun/${proc.versions.bun}`;
  if (proc?.versions?.node) return `sendfully-node/${sdkVersion} node/${proc.versions.node}`;
  const deno = getDeno();
  if (deno?.version?.deno) return `sendfully-node/${sdkVersion} deno/${deno.version.deno}`;
  return `sendfully-node/${sdkVersion}`;
}

export function isBrowser(): boolean {
  const w = (globalThis as { window?: { document?: unknown } }).window;
  return typeof w !== "undefined" && typeof w.document !== "undefined";
}
