// Resume persistence + the admin-visible playback session heartbeat, sharing
// one interval. Progress saves on a coarser cadence than the ping, and again
// on unmount, so a swipe-away never loses more than a few seconds.
//
// Also listens for the admin TERMINATING this session, the same two ways the
// shared service (@kroma/ui services/playback) does: the `playback.terminate`
// event on the live WS bus, and a 410 on the next ping as fallback.

import {
  KromaApiError,
  type KromaClient,
  KromaEvents,
  type MediaItem,
  PlaybackSessionId,
} from '@kroma/core';
import * as Device from 'expo-device';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

const PING_MS = 10_000;

// The server drops a session 30 s after its last beat and logs it to history
// (SESSION_TTL in services/playback/registry.rs). A beat later than that is not a
// heartbeat: the registry has already closed and recorded the session, so pinging
// the same id opens a NEW one. A suspended app is where this bites.
const SESSION_TTL_MS = 30_000;

export interface HeartbeatSnapshot {
  positionSec: number;
  durationSec: number;
  playing: boolean;
  waiting: boolean;
  mode: 'direct' | 'master';
  aac: boolean;
  audioLang?: string;
  subtitleLang?: string;
}

function pingState(s: HeartbeatSnapshot): 'buffering' | 'playing' | 'paused' {
  if (s.waiting) return 'buffering';
  return s.playing ? 'playing' : 'paused';
}

function pingMode(s: HeartbeatSnapshot): 'direct' | 'remux' | 'transcode' {
  if (s.mode === 'direct') return 'direct';
  return s.aac ? 'transcode' : 'remux';
}

// Sessions opened by this process so far, so two playbacks started in the
// same millisecond still get distinct ids.
let sessionSeq = 0;

// Not a secret and never an auth token, so this needs uniqueness, not
// unpredictability. React Native has no `crypto.randomUUID`, and pulling in a
// native crypto module just to name a dashboard row isn't a trade worth making.
function newSessionId(device: string): PlaybackSessionId {
  const slug = device.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
  return PlaybackSessionId.parse(
    `mob-${slug}-${Date.now().toString(36)}-${(sessionSeq++).toString(36)}`,
  );
}

function deviceLabel(): string {
  return Device.modelName ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android');
}

interface Session {
  itemId: string;
  id: PlaybackSessionId;
  /** Whether the server knows this session, so a title that never played is
   *  neither registered nor stopped. */
  opened: boolean;
  terminated: boolean;
  lastBeat: { at: number; positionSec: number } | null;
}

function openSession(itemId: string, device: string): Session {
  return { itemId, id: newSessionId(device), opened: false, terminated: false, lastBeat: null };
}

export function useHeartbeat(
  client: KromaClient,
  item: MediaItem,
  snapshot: () => HeartbeatSnapshot,
  /** Fired ONCE when an admin terminates this session: the custom message, or
   *  '' for the localized default. The player pauses and shows it. */
  onTerminated?: (message: string) => void,
): void {
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;
  const onTerminatedRef = useRef(onTerminated);
  onTerminatedRef.current = onTerminated;
  const [device] = useState(deviceLabel);
  // One id per title watched, NOT one per effect run: a client swapped
  // underneath a running player is the same viewing, and re-minting here would
  // strand the previous id for the reaper to log as a play of its own.
  const session = useRef<Session | null>(null);
  // A stop that overtakes its own ping ends nothing, and the ping then leaves a
  // session no one will ever close.
  const inFlight = useRef<Promise<unknown>>(Promise.resolve());
  const clientRef = useRef(client);
  clientRef.current = client;

  useEffect(() => {
    if (session.current?.itemId !== item.id) session.current = openSession(item.id, device);
    const live = session.current;
    const fireTerminated = (message: string) => {
      if (live.terminated) return;
      live.terminated = true;
      onTerminatedRef.current?.(message);
    };

    const save = () => {
      const s = snapRef.current();
      if (s.positionSec <= 0) return;
      void client.playback
        .save(item.id, Math.round(s.positionSec * 1000), Math.round(s.durationSec * 1000) || null)
        .catch(() => undefined);
    };

    const ping = () => {
      if (live.terminated) return;
      const s = snapRef.current();
      const now = Date.now();
      const previous = live.lastBeat;
      live.lastBeat = { at: now, positionSec: s.positionSec };
      const beforeGap = previous && now - previous.at > SESSION_TTL_MS ? previous : null;
      if (beforeGap) live.opened = false;
      if (!live.opened) {
        if (pingState(s) !== 'playing') return;
        // Re-opening across a gap takes a playhead that moved through it: the
        // transport flag survives a suspended app, the position does not.
        if (beforeGap && s.positionSec <= beforeGap.positionSec) return;
      }
      live.opened = true;
      inFlight.current = client.playback
        .ping({
          sessionId: live.id,
          itemId: item.id,
          positionMs: Math.round(s.positionSec * 1000),
          durationMs: Math.round(s.durationSec * 1000) || null,
          state: pingState(s),
          mode: pingMode(s),
          player: 'Kroma Mobile',
          device,
          audio: s.audioLang,
          subtitle: s.subtitleLang,
        })
        .catch((e: unknown) => {
          // 410 Gone → an admin terminated this session (WS fallback).
          if (e instanceof KromaApiError && e.status === 410) fireTerminated('');
        });
    };

    ping();
    const timer = setInterval(() => {
      ping();
      save();
    }, PING_MS);

    // The prompt channel: the admin's stop arrives as a live event, matched to
    // THIS session's id, so the phone halts within a beat rather than at the
    // next ping.
    const events = new KromaEvents(client.baseUrl, {
      onEvent: (e) => {
        if (e.type === 'playback.terminate' && e.sessionId === live.id) {
          fireTerminated(e.message);
        }
      },
    });
    events.connect();

    return () => {
      clearInterval(timer);
      events.close();
      save();
    };
  }, [client, item.id, device]);

  // Ending the session is the TITLE's lifecycle, not the loop's: a client
  // swapped underneath a running player rebinds the loop above, and stopping
  // here would log a second history row for one viewing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: item.id is the reset key that ends one title's session, not a value this closure reads.
  useEffect(() => {
    return () => {
      const live = session.current;
      if (!live || live.terminated || !live.opened) return;
      live.opened = false;
      const owner = clientRef.current;
      inFlight.current = inFlight.current
        .then(() => owner.playback.stop(live.id))
        .catch(() => undefined);
    };
  }, [item.id]);
}
