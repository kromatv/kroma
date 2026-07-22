// Resume persistence + the admin-visible playback session heartbeat, sharing
// one interval. Progress is saved on a coarser cadence than the ping and again
// on unmount so a swipe-away never loses more than a few seconds.

import type { KromaClient, MediaItem } from '@kroma/core';
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

function newSessionId(): string {
  return `mob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useHeartbeat(
  client: KromaClient,
  item: MediaItem,
  snapshot: () => HeartbeatSnapshot,
): void {
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;

  useEffect(() => {
    const sessionId = newSessionId();
    const device = Device.modelName ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android');

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
        .catch(() => undefined);
    };

    ping();
    const timer = setInterval(() => {
      ping();
      save();
    }, PING_MS);

    return () => {
      clearInterval(timer);
      save();
      void client.stopPlayback(sessionId).catch(() => undefined);
    };
  }, [client, item.id]);
}
