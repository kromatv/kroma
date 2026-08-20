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
  type LanDiscoveryBridge,
} from '@kroma/core';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { useLanCast } from '#ui/services/cast-lan';
import { type Cast, CastCtx } from './cast-context';
import { applyCastEvent } from './cast-events';
import { livePosition, type PositionBase } from './cast-position';

const TICK_MS = 500;

export interface CastProviderProps {
  /** Null while a shell is still resolving its session; treated as "not yet". */
  client: KromaClient | null;
  /** Gates everything on being signed in - the roster needs a session. */
  enabled: boolean;
  /** What this device calls itself on the TV's list of remotes ("iPhone",
   * "Chrome"). Shown across the room, so it should be a thing, not a session id. */
  deviceName: string;
  /** This device's DNS-SD stack, when the shell has one. It makes a television
   * appear the moment it is heard rather than on the next beat, and surfaces
   * the ones with no account at all. */
  lan?: LanDiscoveryBridge;
  children: ReactNode;
}

export function CastProvider({
  client,
  enabled,
  deviceName,
  lan,
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
  // Read from the socket's `onOpen` and from the stable callbacks below, none
  // of which are re-created per render. Written in a layout effect rather than
  // during render, which is the spelling the React Compiler accepts; nothing
  // reads them before the commit lands.
  const drivingRef = useRef<string | null>(null);
  const name = useRef(deviceName);
  const receiversRef = useRef<CastReceiver[]>(receivers);
  useLayoutEffect(() => {
    drivingRef.current = activeId;
    name.current = deviceName;
    receiversRef.current = receivers;
  });

  const refresh = useCallback(() => {
    if (!enabled || !client) return;
    client
      .castReceivers()
      .then(setReceivers)
      .catch(() => undefined);
  }, [client, enabled]);

  // What the link adds: a signed-in television heard here is refetched at once
  // instead of on the next beat, and the ones with no account are surfaced so a
  // picker never reads "none available" with one in the room.
  const pairable = useLanCast({
    lan,
    enabled: enabled && Boolean(client),
    onUnknownReceiver: refresh,
    knowsReceiver: (id) => receiversRef.current.some((r) => r.id === id),
  });

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

  // The latest `receivers` stay reachable through `receiversRef` above, so
  // `select` is never re-created.
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
      pairable,
      active,
      available: receivers.length > 0,
      positionMs,
      select,
      playOn,
      send,
      error,
    }),
    [receivers, pairable, active, positionMs, select, playOn, send, error],
  );

  return <CastCtx.Provider value={value}>{children}</CastCtx.Provider>;
}

export type { Cast } from './cast-context';
export { useCast } from './cast-context';
