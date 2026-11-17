import type { KromaClient } from '@kromatv/client';

/** What a server said about its accounts. `unknown` is a server that did not
 * answer, which is never read as a server with no account. */
export type ServerOwner = 'present' | 'missing' | 'unknown';

interface OwnerWatchOptions {
  ask: () => Promise<ServerOwner>;
  onAnswer: (owner: ServerOwner) => void;
  everyMs?: number;
}

interface OwnerWatch {
  recheck: () => void;
  stop: () => void;
}

export const OWNER_RECHECK_MS = 5000;
const ANSWER_TIMEOUT_MS = 4000;

/** Asks a server whether it has an account yet. A server that fails, or does
 * not answer in time, is `unknown`. */
export async function askServerOwner(client: KromaClient): Promise<ServerOwner> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), ANSWER_TIMEOUT_MS);
  try {
    const { hasAccounts } = await client.accounts.config({ signal: ctrl.signal });
    return hasAccounts ? 'present' : 'missing';
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timeout);
  }
}

/** Asks at once, then every `everyMs` until the server reports an account.
 * `recheck()` asks now, unless an answer is already on its way. */
export function watchServerOwner(options: OwnerWatchOptions): OwnerWatch {
  const { ask, onAnswer, everyMs = OWNER_RECHECK_MS } = options;
  let stopped = false;
  let asking = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function round(): Promise<void> {
    if (stopped || asking) {
      return;
    }
    asking = true;
    clearTimeout(timer);
    const owner = await ask();
    asking = false;
    if (stopped) {
      return;
    }
    onAnswer(owner);
    if (owner !== 'present') {
      timer = setTimeout(() => void round(), everyMs);
    }
  }

  const stop = () => {
    stopped = true;
    clearTimeout(timer);
  };

  void round();
  return { recheck: () => void round(), stop };
}
