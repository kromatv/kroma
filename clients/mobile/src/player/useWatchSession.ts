import type { KromaClient } from '@kromatv/client';
import type { CapabilitySource } from '@kromatv/client/capabilities';
import type { WatchItem } from '@kromatv/client/watchable';
import { langName, type WatchReady, watchItem } from '@kromatv/core';
import type { WatchSubtitles } from '@kromatv/core/react';
import type { Translate } from '@kromatv/i18n';
import { usePlaybackHeartbeat } from '@kromatv/ui';
import { useMemo, useState } from 'react';
import { deviceLabel } from '#mobile/player/heartbeat';
import type { WatchEngine } from '#mobile/player/watchEngine';

/** What a watch session answers: the file as a heartbeat and a cast name it,
 * and, once an admin stopped it, the message to show, empty for the default
 * one, null before. */
export interface WatchSession {
  item: WatchItem;
  stopped: string | null;
}

/** Keeps a file of a watch download on the admin's "now playing" while this
 * phone plays it, and shuts the player once an admin stops it. `audioLabel`
 * names the soundtrack the viewer picked. */
export function useWatchSession({
  client,
  source,
  stage,
  engine,
  audioLabel,
  subs,
  t,
}: Readonly<{
  client: KromaClient;
  source: CapabilitySource;
  stage: WatchReady;
  engine: Pick<WatchEngine, 'cur' | 'playing' | 'waiting' | 'shutdown'>;
  audioLabel: string | undefined;
  subs: Pick<WatchSubtitles, 'tracks' | 'active'>;
  t: Translate;
}>): WatchSession {
  const item = useMemo(
    () => watchItem({ mount: source.mount, target: stage.target }),
    [source.mount, stage.target],
  );
  const shown = subs.tracks.find((track) => track.index === subs.active);
  const subtitleLabel = shown
    ? (shown.title ?? langName(t, shown.language) ?? undefined)
    : undefined;
  const [stopped, setStopped] = useState<string | null>(null);
  usePlaybackHeartbeat({
    client,
    enabled: client.hasAuth,
    subject: { watch: item },
    durationMs: stage.probe.durationMs,
    getPosition: () => engine.cur,
    getState: () => {
      if (!engine.playing) return 'paused';
      return engine.waiting ? 'buffering' : 'playing';
    },
    getAudio: () => audioLabel,
    getSubtitle: () => subtitleLabel,
    pingSignal: `${engine.playing}|${engine.waiting}|${audioLabel ?? ''}|${subtitleLabel ?? ''}`,
    mode: 'remux',
    player: 'Kroma Mobile',
    device: deviceLabel(),
    eventsBaseUrl: client.baseUrl,
    idPrefix: 'mob',
    onTerminated: (message) => {
      engine.shutdown();
      setStopped(message.trim());
    },
  });
  return { item, stopped };
}
