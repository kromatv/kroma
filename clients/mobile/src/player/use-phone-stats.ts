import type { MediaItem } from '@kromatv/client/media';
import { audioTracksOf } from '@kromatv/core';
import { audioFilterLabels, buildLeanStats, type PlayerStats } from '@kromatv/ui';
import { useRef } from 'react';
import { useT } from '#mobile/lib/i18n';
import type { Engine } from './engine';

export function usePhoneStats(engine: Engine, item: MediaItem): () => PlayerStats {
  const t = useT();
  const filterLabels = audioFilterLabels(t);
  let sourceMode = 'HLS';
  if (engine.offline) sourceMode = 'Direct · local';
  else if (engine.mode === 'direct') sourceMode = 'Direct';

  // AVPlayer exposes no network counters to JS, so download speed is estimated
  // from the buffered edge advancing, smoothed, with a seek's jump clamped.
  const net = useRef({ at: 0, bufEnd: 0, ema: 0 });
  const file = item.files.find((f) => f.id === item.defaultFileId) ?? item.files[0];
  const avgBytesPerSec =
    file?.size && item.durationMs ? file.size / (item.durationMs / 1000) : null;
  const bandwidthMbps = (): number | null => {
    if (engine.offline || avgBytesPerSec == null) return null;
    const now = Date.now();
    const prev = net.current;
    if (prev.at === 0) {
      net.current = { at: now, bufEnd: engine.buffered, ema: 0 };
      return 0;
    }
    const dt = (now - prev.at) / 1000;
    if (dt < 0.2) return prev.ema;
    const gained = Math.min(Math.max(0, engine.buffered - prev.bufEnd), dt * 50);
    const inst = ((gained / dt) * avgBytesPerSec * 8) / 1e6;
    const ema = prev.ema === 0 ? inst : prev.ema * 0.6 + inst * 0.4;
    net.current = { at: now, bufEnd: engine.buffered, ema };
    return ema;
  };

  return () => {
    const mbps = bandwidthMbps();
    return buildLeanStats({
      item,
      cur: engine.cur,
      dur: engine.dur,
      bufEnd: engine.buffered,
      audioTracks: engine.offline ? [] : audioTracksOf(item),
      audioIndex: engine.audioIndex,
      video: null,
      mode: sourceMode,
      t,
      meters:
        mbps == null
          ? undefined
          : [
              {
                key: 'bandwidth',
                label: t('stats.bandwidth'),
                value: mbps,
                display: `${mbps.toFixed(2)} Mb/s`,
              },
            ],
      extra: [
        {
          label: t('stats.speed'),
          value: engine.rate === 1 ? t('player.normalSpeed') : `${engine.rate}×`,
          group: t('stats.playback'),
        },
        ...(engine.offline
          ? []
          : [
              {
                label: t('player.audioFilters'),
                value: filterLabels[engine.filter],
                group: t('stats.playback'),
              },
            ]),
      ],
    });
  };
}
