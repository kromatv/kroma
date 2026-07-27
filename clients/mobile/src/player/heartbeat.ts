// Resume persistence + the admin-visible playback session heartbeat, sharing
// one interval. Progress is saved on a coarser cadence than the ping and again
// on unmount so a swipe-away never loses more than a few seconds.
//
// It also listens for the admin TERMINATING this session, both ways the shared
// service (@kroma/ui services/playback) hears it: the `playback.terminate`
// event on the live WS bus, and a 410 on the next ping as the fallback. This
// hook should eventually BE that shared service - it only still exists apart
// because it also owns the phone's progress persistence.

import { KromaApiError, type KromaClient, KromaEvents, type MediaItem } from '@kroma/core';
import * as Device from 'expo-device';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

const PING_MS = 10_000;

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

/** Sessions opened by this process so far, so two playbacks started in the same
 * millisecond still get distinct ids. */
let sessionSeq = 0;

/** A session id keys ONE row in the server's live "now playing" registry and is
 * never an auth token or a secret, so it needs uniqueness, not unpredictability.
 * Device + clock + counter gives that without a random source (React Native has
 * no `crypto.randomUUID`, and pulling in a native crypto module to name a
 * dashboard row would not be a trade worth making), and the id stays readable in
 * the admin console. */
function newSessionId(device: string): string {
  const slug = device.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
  return `mob-${slug}-${Date.now().toString(36)}-${(sessionSeq++).toString(36)}`;
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

  useEffect(() => {
    const device = Device.modelName ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android');
    const sessionId = newSessionId(device);
    // Once terminated: stop pinging (a ping would re-register the session the
    // admin just removed) and skip the redundant stop on unmount.
    let terminated = false;
    const fireTerminated = (message: string) => {
      if (terminated) return;
      terminated = true;
      onTerminatedRef.current?.(message);
    };

    const save = () => {
      const s = snapRef.current();
      if (s.positionSec <= 0) return;
      void client
        .saveProgress(
          item.id,
          Math.round(s.positionSec * 1000),
          Math.round(s.durationSec * 1000) || null,
        )
        .catch(() => undefined);
    };

    const ping = () => {
      if (terminated) return;
      const s = snapRef.current();
      void client
        .pingPlayback({
          sessionId,
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
        if (e.type === 'playback.terminate' && e.sessionId === sessionId) {
          fireTerminated(e.message);
        }
      },
    });
    events.connect();

    return () => {
      clearInterval(timer);
      events.close();
      save();
      if (!terminated) void client.stopPlayback(sessionId).catch(() => undefined);
    };
  }, [client, item.id]);
}
