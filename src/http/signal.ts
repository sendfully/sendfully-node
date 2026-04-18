/**
 * Combine a caller-supplied `AbortSignal` with an SDK timeout into a single
 * signal. `timedOut` lets callers tell an SDK timeout apart from a caller abort.
 */
export interface CombinedSignal {
  signal: AbortSignal | undefined;
  readonly timedOut: boolean;
}

export function combineSignals(
  timeoutMs: number | undefined,
  callerSignal: AbortSignal | undefined,
): CombinedSignal {
  const timeoutSignal =
    timeoutMs !== undefined && timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
  const signals = [callerSignal, timeoutSignal].filter((s): s is AbortSignal => s !== undefined);
  const signal =
    signals.length === 0 ? undefined : signals.length === 1 ? signals[0] : AbortSignal.any(signals);
  return {
    signal,
    get timedOut() {
      return timeoutSignal?.aborted === true;
    },
  };
}
