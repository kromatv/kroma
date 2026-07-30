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
  type ServerEvent,
} from '@kroma/core';
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

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
  /** The last failure, as a message key, or null. Cleared on the next success.
   * `cast.kicked` is not a failure exactly - the TV chose to let this remote go. */
  error: 'cast.gone' | 'cast.failed' | 'cast.kicked' | null;
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
  /** What this device calls itself on the TV's list of remotes ("iPhone",
   * "Chrome"). Shown across the room, so it should be a thing, not a session id. */
  deviceName: string;
  children: ReactNode;
}

/** The state a [`applyCastEvent`] fold writes through. Grouped rather than
 * passed positionally: four same-shaped setters in a row is an argument list
 * nobody can read, and two of them are only touched by one event. */
interface CastEventSetters {
  receivers: Dispatch<SetStateAction<CastReceiver[]>>;
  activeId: Dispatch<SetStateAction<string | null>>;
  error: Dispatch<SetStateAction<Cast['error']>>;
  base: Dispatch<SetStateAction<PositionBase | null>>;
}

/** Fold one bus event into the roster / position state.
 *
 * At module scope rather than inside the effect: rows arrive whole (a play or
 * pause on one TV costs every sender a patch instead of a refetch), and keeping
 * the fold here means the effect stays a flat wiring step.
 */
function applyCastEvent(e: ServerEvent, set: CastEventSetters): void {
  if (e.type === 'cast.receiver') {
    set.receivers((list) => upsert(list, e.receiver));
  } else if (e.type === 'cast.receiver.gone') {
    set.receivers((list) => list.filter((r) => r.id !== e.receiverId));
  } else if (e.type === 'cast.kicked') {
    // The television let this remote go. Stand down rather than keep showing a
    // set we no longer drive.
    set.activeId((id) => (id === e.receiverId ? null : id));
    set.error('cast.kicked');
  } else if (e.type === 'cast.position') {
    set.base({
      id: e.receiverId,
      positionMs: e.positionMs,
      playing: e.state === 'playing',
      at: Date.now(),
    });
  }
}

export function CastProvider({
  client,
  enabled,
  deviceName,
  children,
}: Readonly<CastProviderProps>) {
  const [receivers, setReceivers] = useState<CastReceiver[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<Cast['error']>(null);
  // Position base: what the TV last reported, and when we heard it. Rendering
  // interpolates from here, so a progress bar moves between heartbeats.
  const [base, setBase] = useState<PositionBase | null>(null);
  // Bumped on a timer while a TV plays, purely to re-render the interpolated
  // position (which is computed from the clock, not from state). A reducer
  // rather than `useState`: the counter's VALUE is never read, and this says so.
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  // The live socket, kept so selecting a TV can announce this remote on it.
  const socket = useRef<KromaEvents | null>(null);
  // Read from the socket's `onOpen`, which is not re-created per render.
  const drivingRef = useRef<string | null>(null);
  drivingRef.current = activeId;
  const name = useRef(deviceName);
  name.current = deviceName;

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
      // Only on (re)connect: a gap in the stream may have swallowed a change, and
      // the roster is the one thing worth resyncing wholesale.
      onOpen: () => {
        refresh();
        // ...and say again what this remote is driving. The server destroys a
        // controller entry the moment its socket closes, so after a reconnect
        // the television has lost this phone from its remote list - and with it
        // any way to disconnect it - while the phone carries on commanding over
        // HTTP, with nothing on either side to reveal the split. The receiver
        // half re-sends `cast.hello` on every open for exactly this reason.
        const driving = drivingRef.current;
        if (driving) events.send({ type: 'cast.control', receiverId: driving, name: name.current });
      },
      onEvent: (e) =>
        applyCastEvent(e, {
          receivers: setReceivers,
          activeId: setActiveId,
          error: setError,
          base: setBase,
        }),
    });
    events.connect();
    socket.current = events;
    return () => {
      socket.current = null;
      events.close();
    };
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
    const iv = setInterval(rerender, TICK_MS);
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
        socket.current?.send({ type: 'cast.control', receiverId, name: name.current });
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
    // Tell the set it is being driven, so it can show this remote (and let it
    // go). Presence rides the socket: closing the app releases it for us.
    socket.current?.send(
      receiverId
        ? { type: 'cast.control', receiverId, name: name.current }
        : { type: 'cast.release' },
    );
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

/** Replace a receiver's row, or add it, keeping the list sorted by name (the
 * server's own order, so a patched list and a refetched one agree). */
function upsert(list: CastReceiver[], row: CastReceiver): CastReceiver[] {
  const next = list.some((r) => r.id === row.id)
    ? list.map((r) => (r.id === row.id ? row : r))
    : [...list, row];
  return next.sort((a, b) => a.name.localeCompare(b.name));
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
