// The sender half of cast: which TVs are up, which one this phone/browser is
// driving, and the orders it sends them.
//
// One provider per app, mounted next to the auth provider, because "what I am
// casting to" is app-wide state: the button on a detail page, the mini bar above
// the tabs and the full remote are three views of the same session.
//
// Live-ness comes off the event bus rather than a poll: `cast.receivers` when the
// roster or a title changes (the provider refetches - small payload, always
// consistent), and `cast.position` on every heartbeat of a playing TV, which
// moves the scrubber without any refetch at all. Between those beats the
// position is interpolated locally, so a remote's progress bar runs smoothly
// instead of stepping every ten seconds.

import {
  type CastCommand,
  type CastReceiver,
  type ItemId,
  KromaApiError,
  type KromaClient,
  KromaEvents,
} from '@kroma/core';
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

/** How often the interpolated position is recomputed while a TV plays. */
const TICK_MS = 500;

/** What a sender can do with the TV it is driving. */
export interface Cast {
  /** Live receivers on this server, the caller's own devices first. */
  receivers: CastReceiver[];
  /** The receiver this sender is driving, or null when playing locally. */
  active: CastReceiver | null;
  /** Whether any TV is available to cast to (drives the button's visibility). */
  available: boolean;
  /** The active receiver's position, interpolated between heartbeats (ms). */
  positionMs: number;
  /** Start driving a receiver (or `null` to go back to local playback). */
  select: (receiverId: string | null) => void;
  /** Start a title on `receiverId`, and drive that TV from now on. */
  playOn: (receiverId: string, itemId: ItemId, positionMs?: number) => Promise<boolean>;
  /** Send an order to the active receiver. False when it failed / went away. */
  send: (command: CastCommand) => Promise<boolean>;
  /** The last failure, as a message key, or null. Cleared on the next success. */
  error: 'cast.gone' | 'cast.failed' | null;
}

const CastCtx = createContext<Cast | null>(null);

/** The cast session. Outside a provider it reads as "no TVs", so a screen can
 * use it unconditionally on a client that never mounted one. */
export function useCast(): Cast {
  return useContext(CastCtx) ?? IDLE;
}

const IDLE: Cast = {
  receivers: [],
  active: null,
  available: false,
  positionMs: 0,
  select: () => undefined,
  playOn: async () => false,
  send: async () => false,
  error: null,
};

export interface CastProviderProps {
  /** Null while a shell is still resolving its session; treated as "not yet". */
  client: KromaClient | null;
  /** Gates everything on being signed in - the roster needs a session. */
  enabled: boolean;
  children: ReactNode;
}

export function CastProvider({ client, enabled, children }: Readonly<CastProviderProps>) {
  const [receivers, setReceivers] = useState<CastReceiver[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<Cast['error']>(null);
  // Position base: what the TV last reported, and when we heard it. Rendering
  // interpolates from here, so a progress bar moves between heartbeats.
  const [base, setBase] = useState<PositionBase | null>(null);
  // Bumped on a timer while a TV plays, purely to re-render the interpolated
  // position (which is computed from the clock, not from state).
  const [, setTick] = useState(0);

  const refresh = useCallback(() => {
    if (!enabled || !client) return;
    client
      .castReceivers()
      .then(setReceivers)
      .catch(() => undefined);
  }, [client, enabled]);

  // Roster: fetched once, then kept live off the bus.
  useEffect(() => {
    if (!enabled || !client) {
      setReceivers([]);
      setActiveId(null);
      return;
    }
    refresh();
    const events = new KromaEvents(client.baseUrl, {
      // A reconnect may have missed events; resync rather than trust the gap.
      onOpen: refresh,
      onEvent: (e) => {
        if (e.type === 'cast.receivers') refresh();
        else if (e.type === 'cast.position') {
          setBase({
            id: e.receiverId,
            positionMs: e.positionMs,
            playing: e.state === 'playing',
            at: Date.now(),
          });
        }
      },
    });
    events.connect();
    return () => events.close();
  }, [client, enabled, refresh]);

  const active = useMemo(
    () => receivers.find((r) => r.id === activeId) ?? null,
    [receivers, activeId],
  );

  // A TV that left the roster (switched off, app quit) is no longer something
  // this sender is driving - drop the selection rather than show a dead remote.
  useEffect(() => {
    if (activeId && receivers.length && !receivers.some((r) => r.id === activeId)) {
      setActiveId(null);
    }
  }, [receivers, activeId]);

  // Advance the interpolated position while the active TV is playing. One timer,
  // only while it is needed: an idle or paused receiver costs nothing.
  const playing = active?.nowPlaying?.state === 'playing';
  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(iv);
  }, [playing]);

  // Recomputed every render (the tick above forces those while playing) rather
  // than memoized: it is arithmetic over the clock, and a memo would cache the
  // one value that must never be cached.
  const positionMs = livePosition(active, base, playing);

  const sendTo = useCallback(
    async (receiverId: string, command: CastCommand): Promise<boolean> => {
      if (!client) return false;
      try {
        await client.sendCastCommand(receiverId, command);
        setError(null);
        return true;
      } catch (e) {
        // 404 = that TV went away between listing it and pressing the button.
        const gone = e instanceof KromaApiError && e.status === 404;
        setError(gone ? 'cast.gone' : 'cast.failed');
        if (gone) {
          setActiveId((id) => (id === receiverId ? null : id));
          refresh();
        }
        return false;
      }
    },
    [client, refresh],
  );

  const playOn = useCallback(
    async (receiverId: string, itemId: ItemId, positionMs = 0) => {
      const ok = await sendTo(receiverId, { type: 'play', itemId, positionMs });
      if (ok) {
        setActiveId(receiverId);
        // Optimistic: the TV's own heartbeat corrects this within a beat, but the
        // remote should not sit at 0:00 while it starts.
        setBase({ id: receiverId, positionMs, playing: true, at: Date.now() });
      }
      return ok;
    },
    [sendTo],
  );

  const send = useCallback(
    async (command: CastCommand) => (activeId ? sendTo(activeId, command) : false),
    [activeId, sendTo],
  );

  // Keep the latest `receivers` reachable from `select` without re-creating it.
  const receiversRef = useRef(receivers);
  receiversRef.current = receivers;
  const select = useCallback((receiverId: string | null) => {
    setActiveId(receiverId);
    setError(null);
    const next = receiverId ? receiversRef.current.find((r) => r.id === receiverId) : null;
    setBase(
      next?.nowPlaying
        ? {
            id: next.id,
            positionMs: next.nowPlaying.positionMs,
            playing: next.nowPlaying.state === 'playing',
            at: Date.now(),
          }
        : null,
    );
  }, []);

  const value = useMemo<Cast>(
    () => ({
      receivers,
      active,
      available: receivers.length > 0,
      positionMs,
      select,
      playOn,
      send,
      error,
    }),
    [receivers, active, positionMs, select, playOn, send, error],
  );

  return <CastCtx.Provider value={value}>{children}</CastCtx.Provider>;
}

/** What a receiver last reported, and when this sender heard it. */
interface PositionBase {
  id: string;
  positionMs: number;
  playing: boolean;
  at: number;
}

/** Where the TV is *now*: what it last told us, plus the wall time since. The
 * roster snapshot and the position event race, so the fresher of the two wins,
 * and the result never runs past the title's own duration. */
function livePosition(
  active: CastReceiver | null,
  base: PositionBase | null,
  playing: boolean,
): number {
  const reported = active?.nowPlaying?.positionMs ?? 0;
  const from = base && base.id === active?.id ? base : null;
  const start = from ? Math.max(from.positionMs, reported) : reported;
  const elapsed = from && (from.playing || playing) ? Math.max(0, Date.now() - from.at) : 0;
  const duration = active?.nowPlaying?.durationMs;
  const out = start + elapsed;
  return duration ? Math.min(out, duration) : out;
}
