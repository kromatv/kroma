import {
  type AudioTrack,
  formatTimecode as clock,
  decimal,
  formatBytes,
  type Locale,
  type Translate,
} from '@kroma/core';
import type { PlayerMeter, PlayerStats } from '@kroma/ui';
import type { EngineLiveStats } from '#web/features/playback/engine-stats';
import type { MovieView } from '#web/shared/lib/api';

const READY = ['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT', 'HAVE_FUTURE', 'HAVE_ENOUGH'];
const NETWORK = ['EMPTY', 'IDLE', 'LOADING', 'NO_SOURCE'];

// `Mb/s` and `kb/s` are SI symbols, the same in every language; only the
// decimal separator moves.
function kbps(k: number | undefined, locale: Locale): string | undefined {
  if (!k || k <= 0) return undefined;
  return k >= 1000 ? `${decimal(k / 1000, locale, 2)} Mb/s` : `${Math.round(k)} kb/s`;
}

// Absent rather than zero: the overlay leaves a figure out instead of showing
// a hollow one, and keeps that decision out of the row builder.
function bytesH(b: number | undefined, locale: Locale): string | undefined {
  return b && b > 0 ? formatBytes(b, locale) : undefined;
}

interface ConnLike {
  downlink?: number;
  effectiveType?: string;
}

export interface WebStatsInput {
  v: HTMLVideoElement | null;
  item: MovieView;
  cur: number;
  dur: number;
  bufEnd: number;
  useHls: boolean;
  aac: boolean;
  anchor: number;
  baseSec: number;
  audioTracks: AudioTrack[];
  audioIndex: number;
  fps?: number;
  engine?: EngineLiveStats | null;
  bytes: number;
  t: Translate;
  locale: Locale;
}

interface StatsMetrics {
  vw: number;
  vh: number;
  dpr: number;
  dw: number;
  dh: number;
  dropped: number;
  totalFrames: number;
  bufferAhead: number;
  avgMbps: number;
  conn: ConnLike;
  rel: number;
  rate: number;
}

function computeMetrics(s: WebStatsInput): StatsMetrics {
  const { v, item, cur, dur, bufEnd } = s;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
  const q = v?.getVideoPlaybackQuality?.();
  const conn =
    (typeof navigator !== 'undefined'
      ? (navigator as Navigator & { connection?: ConnLike }).connection
      : undefined) ?? {};
  return {
    vw: v?.videoWidth || item.video?.width || 0,
    vh: v?.videoHeight || item.video?.height || 0,
    dpr,
    dw: v ? Math.round(v.clientWidth * dpr) : 0,
    dh: v ? Math.round(v.clientHeight * dpr) : 0,
    dropped: q?.droppedVideoFrames ?? 0,
    totalFrames: q?.totalVideoFrames ?? 0,
    bufferAhead: Math.max(0, bufEnd - cur),
    avgMbps: s.bytes && dur ? (s.bytes * 8) / dur / 1e6 : 0,
    conn,
    rel: v?.currentTime ?? 0,
    rate: v?.playbackRate ?? 1,
  };
}

function videoCodecLabel(item: MovieView): string {
  const vcodec = item.video?.codec?.toUpperCase() ?? '-';
  const depth = item.video?.bitDepth ? ` ${item.video.bitDepth}-bit` : '';
  const hdr = item.video?.hdr ? ' HDR' : '';
  return `${vcodec}${depth}${hdr}`;
}

function audioFormatLabel(selAudio: AudioTrack | undefined, item: MovieView): string {
  const acodec = selAudio?.codec?.toUpperCase() ?? item.audio?.codec?.toUpperCase() ?? '-';
  const channels = selAudio?.channels ? ` ${selAudio.channels}.0` : '';
  const language = selAudio?.language ? ` (${selAudio.language})` : '';
  return `${acodec}${channels}${language}`;
}

// The panel renders each `group` as its own titled column.
type ExtraRow = { label: string; value: string; group?: string };

function statsRows(s: WebStatsInput, m: StatsMetrics): ExtraRow[] {
  const { v, item, cur, useHls, anchor, baseSec, engine, t } = s;
  const { dw, dh, dpr, rel, conn, rate } = m;
  const position = useHls ? `${clock(cur)} · rel ${rel.toFixed(0)}s` : clock(cur);
  const push = (group: string, label: string, value: string | undefined) => {
    if (value != null && value !== '') rows.push({ group, label, value });
  };
  const media = t('stats.groupMedia');
  const transport = t('stats.groupTransport');
  const client = t('stats.groupClient');

  const rows: ExtraRow[] = [
    { group: media, label: t('stats.title2'), value: item.title },
    { group: media, label: t('stats.container'), value: item.container.toUpperCase() },
    { group: media, label: t('stats.position'), value: position },
    {
      group: media,
      label: t('stats.size'),
      value: bytesH(s.bytes, s.locale) ?? '…',
    },
  ];
  if (useHls) {
    rows.push({
      group: media,
      label: t('stats.anchor'),
      value: `${clock(anchor)} (${baseSec.toFixed(0)}s)`,
    });
  }
  // Absent on direct-play / native HLS.
  if (engine) {
    push(transport, t('stats.streamBitrate'), kbps(engine.streamBitrateKbps, s.locale));
    push(transport, t('stats.bandwidth'), kbps(engine.estBandwidthKbps, s.locale));
    if (engine.stalls != null) {
      const buffering = engine.bufferingSec ? ` (${engine.bufferingSec.toFixed(1)}s)` : '';
      push(transport, t('stats.stalls'), `${engine.stalls}${buffering}`);
    }
    push(transport, t('stats.downloaded'), bytesH(engine.bytesDownloaded, s.locale));
    push(transport, t('stats.codecs'), engine.currentCodecs);
  }
  push(
    transport,
    t('stats.state'),
    `${READY[v?.readyState ?? 0]} · NET_${NETWORK[v?.networkState ?? 0]}`,
  );
  push(client, t('stats.display'), dw && dh ? `${dw}×${dh} @${dpr}x` : '-');
  push(
    client,
    t('stats.volume'),
    `${Math.round((v?.volume ?? 1) * 100)}%${v?.muted ? t('stats.volumeMuted') : ''}`,
  );
  if (rate !== 1) push(client, t('stats.speed'), `${rate.toFixed(2)}×`);
  push(
    client,
    t('stats.connection'),
    conn.downlink ? `${conn.downlink} Mb/s · ${conn.effectiveType ?? ''}` : '-',
  );
  return rows;
}

// A low-water mark, not the goal: the goal is per-title (see `itemBufferPlan`),
// and 10 s is Shaka's own default `bufferingGoal`.
const LOW_BUFFER_SEC = 10;

// Bandwidth and bitrate share one chart: the gap between them is the
// diagnostic. Colours are the panel's to assign, from a colourblind-safe palette.
function buildMeters(s: WebStatsInput, m: StatsMetrics): PlayerMeter[] {
  const meters: PlayerMeter[] = [];
  const eng = s.engine;
  // Bandwidth first: it owns the band drawn between the pair.
  if (eng?.estBandwidthKbps) {
    meters.push({
      key: 'bandwidth',
      label: s.t('stats.bandwidth'),
      value: eng.estBandwidthKbps,
      display: kbps(eng.estBandwidthKbps, s.locale) ?? '-',
      chart: 'throughput',
      chartLabel: s.t('stats.throughput'),
      band: true,
    });
  }
  if (eng?.streamBitrateKbps) {
    meters.push({
      key: 'bitrate',
      label: s.t('stats.streamBitrate'),
      value: eng.streamBitrateKbps,
      display: kbps(eng.streamBitrateKbps, s.locale) ?? '-',
      chart: 'throughput',
    });
  }
  meters.push({
    key: 'buffer',
    label: s.t('stats.buffer'),
    value: m.bufferAhead,
    display: s.t('stats.bufferAhead', { seconds: m.bufferAhead.toFixed(1) }),
    reference: {
      value: LOW_BUFFER_SEC,
      label: s.t('stats.bufferAhead', { seconds: String(LOW_BUFFER_SEC) }),
    },
  });
  return meters;
}

/** The "stats for nerds" snapshot for the shared StatsPanel. */
export function buildWebStats(s: WebStatsInput): PlayerStats {
  const { item, useHls, aac, audioTracks, audioIndex, t } = s;
  const m = computeMetrics(s);
  const selAudio = audioTracks.find((a) => a.index === audioIndex) ?? audioTracks[0];
  const codecMode = aac ? 'AAC' : 'copy';
  const mode = useHls ? `HLS · ${codecMode}` : 'Direct';

  return {
    mode,
    resolution: m.vw && m.vh ? `${m.vw}×${m.vh}` : undefined,
    videoCodec: videoCodecLabel(item),
    fps: s.fps && s.fps > 0 ? `${s.fps.toFixed(2)} fps` : undefined,
    audioFormat: audioFormatLabel(selAudio, item),
    bitrate: m.avgMbps ? `${m.avgMbps.toFixed(2)} Mb/s` : undefined,
    buffer: t('stats.bufferAhead', { seconds: m.bufferAhead.toFixed(1) }),
    dropped: `${m.dropped} / ${m.totalFrames}`,
    extra: statsRows(s, m),
    meters: buildMeters(s, m),
  };
}
