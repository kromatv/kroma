import type { KromaClient } from '@kromatv/client';
import type { DirectOffer } from '@kromatv/client/server';
import { askDirectOffer, connectDirect, type DirectOutcome, lanRoutes } from './connect-direct';

const RECHECK_MS = 5 * 60_000;
const AWAY_MS = 60_000;
const PROMPT_TIMEOUT_MS = 60_000;

/** Whether this app may reach its own network unprompted. A browser page on the
 * open web answers from its `local-network` permission; anything else may. */
export type LanPermission = 'granted' | 'prompt' | 'denied' | 'unsupported';

/** The timer pair the controller schedules with, so a test can drive it. */
export interface Timers {
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface DirectConnectionOptions {
  fetch: typeof globalThis.fetch;
  permission?: () => Promise<LanPermission>;
  timeoutMs?: number;
  promptTimeoutMs?: number;
  recheckMs?: number;
  awayMs?: number;
  now?: () => number;
  timers?: Timers;
  onChange?: (state: DirectState) => void;
}

/** The direct base in use, if any, and whether a route was offered on this
 * network with only the person's permission missing (`askable`): what a
 * browser shows its offer on. */
export interface DirectState {
  route?: string;
  askable: boolean;
}

/** A running watch over one client's direct route. `setSignedIn(true)` asks at
 * once and `false` drops the route and stops asking; `setForeground(true)`
 * after `awayMs` or more away asks again, as `recheck()` does at once.
 * `connectNow()` is the person asking: it probes now, with `promptTimeoutMs` to
 * answer the browser's prompt the probe raises. */
export interface DirectConnection {
  state(): DirectState;
  setSignedIn(signedIn: boolean): void;
  setForeground(inFront: boolean): void;
  recheck(): void;
  connectNow(): Promise<DirectOutcome>;
  stop(): void;
}

const GLOBAL_TIMERS: Timers = {
  setTimeout: (run, ms) => globalThis.setTimeout(run, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Keep `client` on a direct route whenever one can be proved, and off it
 * whenever it stops answering. Asks on sign-in, when told the network is back,
 * on coming back after `awayMs` (default 1 min) and every `recheckMs` (default
 * 5 min) while on the configured base. Never probes where `permission` does
 * not say `granted`; omitted, the platform may. `connectNow` waits
 * `promptTimeoutMs` (default 60 s) on each probe. */
export function startDirectConnection(
  client: KromaClient,
  options: DirectConnectionOptions,
): DirectConnection {
  const timers = options.timers ?? GLOBAL_TIMERS;
  const now = options.now ?? Date.now;
  let signedIn = false;
  let stopped = false;
  let inFlight = false;
  let askable = false;
  let awaySince: number | undefined;
  let lastOffer: DirectOffer | undefined;
  let timer: unknown;

  const state = (): DirectState => ({ route: client.route.direct(), askable });
  const emit = () => options.onChange?.(state());
  const idle = () => !signedIn || stopped;

  const schedule = () => {
    timers.clearTimeout(timer);
    timer = undefined;
    if (idle() || client.route.direct()) return;
    timer = timers.setTimeout(() => void attempt(), options.recheckMs ?? RECHECK_MS);
  };

  async function attempt(): Promise<void> {
    if (idle() || inFlight) return;
    inFlight = true;
    try {
      const offer = await askDirectOffer(client);
      if (!offer || idle()) return;
      lastOffer = offer;
      const permission = (await options.permission?.()) ?? 'granted';
      askable = permission === 'prompt' && offer.sameNetwork && lanRoutes(offer, client).length > 0;
      if (permission !== 'granted') {
        client.route.drop();
        return;
      }
      await connectDirect(client, { fetch: options.fetch, timeoutMs: options.timeoutMs, offer });
    } finally {
      inFlight = false;
      emit();
      schedule();
    }
  }

  const unsubscribe = client.route.subscribe(() => {
    emit();
    schedule();
  });

  return {
    state,
    setSignedIn(next) {
      if (next === signedIn) return;
      signedIn = next;
      if (next) {
        void attempt();
        return;
      }
      askable = false;
      lastOffer = undefined;
      client.route.drop();
      schedule();
      emit();
    },
    setForeground(inFront) {
      if (!inFront) {
        awaySince ??= now();
        return;
      }
      const away = awaySince === undefined ? 0 : now() - awaySince;
      awaySince = undefined;
      if (away >= (options.awayMs ?? AWAY_MS)) void attempt();
    },
    recheck: () => void attempt(),
    async connectNow() {
      if (idle() || !lastOffer) return { kind: 'unknown' };
      const outcome = await connectDirect(client, {
        fetch: options.fetch,
        timeoutMs: options.promptTimeoutMs ?? PROMPT_TIMEOUT_MS,
        routesFrom: lastOffer,
      });
      if (outcome.kind === 'direct') askable = false;
      emit();
      return outcome;
    },
    stop() {
      stopped = true;
      timers.clearTimeout(timer);
      unsubscribe();
    },
  };
}
