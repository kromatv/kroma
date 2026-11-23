/** One timing a client measured: an API call as the device waited for it, or
 *  a screen from navigation to drawn. */
export interface TimingSample {
  kind: 'api' | 'screen';
  name: string;
  ms: number;
  serverMs?: number;
}

/** Where samples gather until they are sent. */
export interface TimingSink {
  add(sample: TimingSample): void;
  flush(): Promise<void>;
}

/** What a send answers: whether the server takes these reports at all. */
export type SendResult = 'sent' | 'refused';

interface SinkOptions {
  send: (samples: TimingSample[]) => Promise<SendResult>;
  /** Samples gathered before a send goes out at once. Defaults to 50. */
  batch?: number;
  /** How long a sample waits for others before it is sent alone. Defaults to 30 s. */
  delayMs?: number;
}

interface SinkState {
  pending: TimingSample[];
  refused: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
  sending: Promise<void>;
}

async function sendPending(state: SinkState, send: SinkOptions['send']): Promise<void> {
  const out = state.pending;
  state.pending = [];
  if (out.length === 0 || state.refused) {
    return;
  }
  const answer: SendResult = await send(out).catch(() => 'sent');
  state.refused = answer === 'refused';
}

/** Gathers samples and sends them in batches. A server that refuses them once
 *  (too old to know the route) is never asked again. */
export function createTimingSink({ send, batch = 50, delayMs = 30_000 }: SinkOptions): TimingSink {
  const state: SinkState = {
    pending: [],
    refused: false,
    timer: undefined,
    sending: Promise.resolve(),
  };

  const flush = (): Promise<void> => {
    clearTimeout(state.timer);
    state.timer = undefined;
    state.sending = state.sending.then(() => sendPending(state, send));
    return state.sending;
  };

  const add = (sample: TimingSample): void => {
    if (state.refused) {
      return;
    }
    state.pending.push(sample);
    if (state.pending.length >= batch) {
      void flush();
    } else {
      state.timer ??= setTimeout(() => void flush(), delayMs);
    }
  };

  return { add, flush };
}
