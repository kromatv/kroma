const POLL_MS = 1000;

function pause(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/** Resolves once the server answers as a process other than `previous`. A read
 *  that fails means the server is still down, so it is tried again every
 *  `intervalMs` until `signal` aborts, which rejects. */
export async function waitForRestart(
  readBootId: () => Promise<string | undefined>,
  previous: string | undefined,
  { intervalMs = POLL_MS, signal }: { intervalMs?: number; signal?: AbortSignal } = {},
): Promise<void> {
  for (;;) {
    signal?.throwIfAborted();
    const current = await readBootId().catch(() => previous);
    if (current !== previous) return;
    signal?.throwIfAborted();
    await pause(intervalMs, signal);
  }
}
