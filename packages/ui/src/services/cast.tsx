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
// moves the scrubber without any refetch at all. Between those beats a view
// counts from the last one by itself (`useCastPosition`), so this provider
// renders only when something changed.

import { apiErrorBody, type DeviceId, KromaApiError, type KromaClient } from '@kromatv/client';
import type { CastCommand, CastReceiver } from '@kromatv/client/cast';
import { KromaEvents } from '@kromatv/client/events';
import type { ItemId } from '@kromatv/client/media';
import { httpReach, type LanDiscoveryBridge, type WakeReach } from '@kromatv/core';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLanCast } from '#ui/services/cast-lan.hook';
import { type Cast, CastCtx, type CastFailure } from './cast-context';
import { applyCastEvent } from './cast-events';
import { useBringBack } from './cast-bring-back.hook';
import { baseOf, drivenBase, livePosition, orderedBase, type PositionBase } from './cast-position';

function failureOf(e: unknown): CastFailure {
  if (!(e instanceof KromaApiError) || e.status !== 404) {
    return 'cast.failed';
  }
  return apiErrorBody(e).code === 'error.itemNotFound' ? 'cast.titleGone' : 'cast.gone';
}

function isAsleep(receivers: CastReceiver[], receiverId: DeviceId): boolean {
  return receivers.some((r) => r.id === receiverId && r.asleep);
}

export interface CastProviderProps {
  /** Null while a shell is still resolving its session; treated as "not yet". */
  client: KromaClient | null;
  /** Gates everything on being signed in - the roster needs a session. */
  enabled: boolean;
  /** What this device calls itself on the TV's list of remotes ("iPhone",
   * "Chrome"). Shown across the room, so it should be a thing, not a session id. */
  deviceName: string;
  /** What this shell can do to a television on its network when one has to be
   * brought back. Defaults to HTTP alone, which is all a browser has. */
  reach?: WakeReach;
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
  reach = httpReach,
  lan,
  children,
}: Readonly<CastProviderProps>) {
  const [receivers, setReceivers] = useState<CastReceiver[]>([]);
  const [activeId, setActiveId] = useState<DeviceId | null>(null);
  const [error, setError] = useState<Cast['error']>(null);
  // Position base: what the TV last reported, and when we heard it. Rendering
  // interpolates from here, so a progress bar moves between heartbeats.
  const [base, setBase] = useState<PositionBase | null>(null);
  // The live socket, kept so selecting a TV can announce this remote on it.
  const socket = useRef<KromaEvents | null>(null);
  // Read from the socket's `onOpen` and from the stable callbacks below, none
  // of which are re-created per render. Written in a layout effect rather than
  // during render, which is the spelling the React Compiler accepts; nothing
  // reads them before the commit lands.
  const drivingRef = useRef<DeviceId | null>(null);
  const name = useRef(deviceName);
  const receiversRef = useRef<CastReceiver[]>(receivers);
  useLayoutEffect(() => {
    drivingRef.current = activeId;
    name.current = deviceName;
    receiversRef.current = receivers;
  });

  const refresh = useCallback(() => {
    if (!enabled || !client) {
      return;
    }
    client.cast
      .receivers()
      .then((rows) => {
        setReceivers(rows);
        setBase((was) => drivenBase(rows, drivingRef.current, was));
      })
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

  const live = enabled && Boolean(client);
  const [wasLive, setWasLive] = useState(live);
  if (wasLive !== live) {
    setWasLive(live);
    if (!live) {
      setReceivers([]);
      setActiveId(null);
    }
  }

  const sinks = useMemo(
    () => ({
      receivers: setReceivers,
      activeId: setActiveId,
      error: setError,
      base: setBase,
      gone: refresh,
    }),
    [refresh],
  );

  // Roster: fetched once, then kept live off the bus.
  useEffect(() => {
    if (!enabled || !client) {
      return undefined;
    }
    refresh();
    const events = new KromaEvents(client.baseUrl, {
      token: () => client.sessionToken,
      refresh: () => client.refreshSession(),
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
        if (driving) {
          events.send({ type: 'cast.control', receiverId: driving, name: name.current });
        }
      },
      onEvent: (e) => applyCastEvent(e, sinks, drivingRef.current),
    });
    events.connect();
    socket.current = events;
    return () => {
      socket.current = null;
      events.close();
    };
  }, [client, enabled, refresh, sinks]);

  const active = useMemo(
    () => receivers.find((r) => r.id === activeId) ?? null,
    [receivers, activeId],
  );

  // A TV that left the roster (switched off, app quit) is no longer something
  // this sender is driving - drop the selection rather than show a dead remote.
  if (activeId && receivers.length && !receivers.some((r) => r.id === activeId)) {
    setActiveId(null);
  }

  const position = useCallback(() => livePosition(active, base), [active, base]);

  const sendTo = useCallback(
    async (receiverId: DeviceId, command: CastCommand): Promise<CastFailure | null> => {
      if (!client) {
        return 'cast.failed';
      }
      setBase((was) => orderedBase(was, { receiverId, command }));
      try {
        await client.cast.command(receiverId, command);
        setError(null);
        return null;
      } catch (e) {
        const failure = failureOf(e);
        setError(failure);
        if (failure === 'cast.gone') {
          setActiveId((id) => (id === receiverId ? null : id));
          refresh();
        }
        return failure;
      }
    },
    [client, refresh],
  );

  const { waking, needsPower, bringBack } = useBringBack({
    client,
    receivers,
    reach,
    socket,
    name,
    setActiveId,
    setError,
    failureOf,
  });

  const playOn = useCallback(
    async (receiverId: DeviceId, itemId: ItemId, startMs = 0) => {
      if (isAsleep(receiversRef.current, receiverId)) {
        return bringBack(receiverId, { type: 'play', itemId, positionMs: startMs });
      }
      const failure = await sendTo(receiverId, { type: 'play', itemId, positionMs: startMs });
      if (!failure) {
        setActiveId(receiverId);
        socket.current?.send({ type: 'cast.control', receiverId, name: name.current });
        // Held at the start: the television says when the picture moves.
        setBase({ id: receiverId, positionMs: startMs, playing: false, at: Date.now() });
      }
      return failure;
    },
    [sendTo, bringBack],
  );

  const send = useCallback(
    (command: CastCommand) =>
      activeId ? sendTo(activeId, command) : Promise.resolve<CastFailure>('cast.failed'),
    [activeId, sendTo],
  );

  // The latest `receivers` stay reachable through `receiversRef` above, so
  // `select` is never re-created.
  const select = useCallback(
    (receiverId: DeviceId | null) => {
      if (receiverId && isAsleep(receiversRef.current, receiverId)) {
        void bringBack(receiverId);
        return;
      }
      setActiveId(receiverId);
      setError(null);
      // Tell the set it is being driven, so it can show this remote (and let it
      // go). Presence rides the socket: closing the app releases it for us.
      socket.current?.send(
        receiverId
          ? { type: 'cast.control', receiverId, name: name.current }
          : { type: 'cast.release' },
      );
      const next = receiversRef.current.find((r) => r.id === receiverId);
      setBase(next ? baseOf(next) : null);
    },
    [bringBack],
  );

  const value = useMemo<Cast>(
    () => ({
      receivers,
      waking,
      wakingNeedsPower: needsPower,
      pairable,
      active,
      available: receivers.length > 0,
      position,
      select,
      playOn,
      send,
      error,
    }),
    [receivers, waking, needsPower, pairable, active, position, select, playOn, send, error],
  );

  return <CastCtx.Provider value={value}>{children}</CastCtx.Provider>;
}

export type { Cast, CastFailure, CastRowKey, CastRowState } from './cast-context';
export { castRowDetail, castRowState, useCast } from './cast-context';
