import type { KromaClient } from '@kromatv/client';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { askServerOwner, type ServerOwner, watchServerOwner } from '#tv/app/owner-watch';
import { useAuth } from '#tv/app/providers/auth';

/** `checking` until the active server has answered, or failed to, for the
 * first time. */
export type OwnerState = ServerOwner | 'checking';

interface ServerOwnerValue {
  owner: OwnerState;
  recheck: () => void;
}

interface Answer {
  client: KromaClient;
  owner: ServerOwner;
}

const ServerOwnerCtx = createContext<ServerOwnerValue | null>(null);

const idle = () => undefined;

function settle(last: Answer | null, next: Answer): Answer {
  return next.owner === 'unknown' && last?.client === next.client ? last : next;
}

function answerFor(client: KromaClient | null, answer: Answer | null): OwnerState {
  return answer?.client === client ? answer.owner : 'checking';
}

/** Whether a pairing code may be shown: the server has an account, or it did
 * not answer and the pairing screen reports that failure itself. */
export function canPair(owner: OwnerState): boolean {
  return owner === 'present' || owner === 'unknown';
}

function useOwnerWatch(client: KromaClient | null, onAnswer: (answer: Answer) => void) {
  const kick = useRef<() => void>(idle);

  useEffect(() => {
    if (!client) {
      return undefined;
    }
    const watch = watchServerOwner({
      ask: () => askServerOwner(client),
      onAnswer: (owner) => onAnswer({ client, owner }),
    });
    kick.current = watch.recheck;
    return () => {
      kick.current = idle;
      watch.stop();
    };
  }, [client, onAnswer]);

  return useCallback(() => kick.current(), []);
}

/**
 * Asks the active server whether it has an account, for as long as this
 * television is signed out and the answer is not yes. A server that stops
 * answering keeps its last answer, and a signed-in television does not ask.
 */
export function ServerOwnerProvider({
  client,
  children,
}: Readonly<{ client: KromaClient | null; children: ReactNode }>) {
  const { ready, user } = useAuth();
  const [answer, setAnswer] = useState<Answer | null>(null);

  if (user && answer && answer.owner !== 'present') {
    setAnswer(null);
  }
  const owner = user ? 'present' : answerFor(client, answer);
  const watching = ready && owner !== 'present';

  const record = useCallback((next: Answer) => setAnswer((last) => settle(last, next)), []);
  const recheck = useOwnerWatch(watching ? client : null, record);
  const value = useMemo(() => ({ owner, recheck }), [owner, recheck]);
  return <ServerOwnerCtx.Provider value={value}>{children}</ServerOwnerCtx.Provider>;
}

export function useServerOwner(): ServerOwnerValue {
  const ctx = useContext(ServerOwnerCtx);
  if (!ctx) {
    throw new Error('useServerOwner() must be used inside <ServerOwnerProvider>');
  }
  return ctx;
}
