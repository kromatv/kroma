import { type AudioTrack, formatTimecode as clock, type Translate } from '@kroma/core';
import type { PlayerMeter, PlayerStats } from '@kroma/ui';
import type { EngineLiveStats } from '#web/features/playback/engine-stats';
import type { MovieView } from '#web/shared/lib/api';

const READY = ['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT', 'HAVE_FUTURE', 'HAVE_ENOUGH'];
const NETWORK = ['EMPTY', 'IDLE', 'LOADING', 'NO_SOURCE'];

/** Kbps as a friendly bitrate: "12.34 Mb/s" above 1 Mbps, else "512 kb/s". */
function kbps(k: number | undefined): string | undefined {
  if (!k || k <= 0) return undefined;
  return k >= 1000 ? `${(k / 1000).toFixed(2)} Mb/s` : `${Math.round(k)} kb/s`;
}

/** Bytes as a friendly size: Go / Mo / Ko. */
function bytesH(b: number | undefined): string | undefined {
  if (!b || b <= 0) return undefined;
  if (b >= 1e9) return `${(b / 1e9).toFixed(2)} Go`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} Mo`;
  return `${Math.round(b / 1e3)} Ko`;
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
  /** Measured playback frame rate (frames decoded / wall-clock), when known. */
  fps?: number;
  /** Live metrics from the active MSE engine (Shaka / hls.js), or null. */
  engine?: EngineLiveStats | null;
  /** Total stream size in bytes (one-shot range probe), for the average bitrate. */
  bytes: number;
  t: Translate;
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

/** Read the live playback metrics off the `<video>` element and the input. */
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

/** The "video codec" headline string (codec + bit depth + HDR). */
function videoCodecLabel(item: MovieView): string {
  const vcodec = item.video?.codec?.toUpperCase() ?? '-';
  const depth = item.video?.bitDepth ? ` ${item.video.bitDepth}-bit` : '';
  const hdr = item.video?.hdr ? ' HDR' : '';
  return `${vcodec}${depth}${hdr}`;
}

/** The "audio format" headline string (codec + channels + language). */
function audioFormatLabel(selAudio: AudioTrack | undefined, item: MovieView): string {
  const acodec = selAudio?.codec?.toUpperCase() ?? item.audio?.codec?.toUpperCase() ?? '-';
  const channels = selAudio?.channels ? ` ${selAudio.channels}.0` : '';
  const language = selAudio?.language ? ` (${selAudio.language})` : '';
  return `${acodec}${channels}${language}`;
}

/** A row of the panel's `extra` list, in the block it belongs to. The panel
 * renders each `group` as its own titled column, which is what keeps twenty
 * diagnostics readable. */
type ExtraRow = { label: string; value: string; group?: string };

/** The verbose HLS/transport diagnostics rows shown under the headline fields,
 * sorted into three blocks: what the FILE is, what the TRANSPORT is doing, and
 * what this CLIENT is. */
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
      value: s.bytes ? `${(s.bytes / 1e9).toFixed(2)} Go` : '…',
    },
  ];
  if (useHls) {
    rows.push({
      group: media,
      label: t('stats.anchor'),
      value: `${clock(anchor)} (${baseSec.toFixed(0)}s)`,
    });
  }
  // Live engine transport (Shaka / hls.js): real bitrate, bandwidth estimate,
  // rebuffering and bytes fetched. Absent on direct-play / native HLS.
  if (engine) {
    push(transport, t('stats.streamBitrate'), kbps(engine.streamBitrateKbps));
    push(transport, t('stats.bandwidth'), kbps(engine.estBandwidthKbps));
    if (engine.stalls != null) {
      const buffering = engine.bufferingSec ? ` (${engine.bufferingSec.toFixed(1)}s)` : '';
      push(transport, t('stats.stalls'), `${engine.stalls}${buffering}`);
    }
    push(transport, t('stats.downloaded'), bytesH(engine.bytesDownloaded));
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

/**
 * Where a buffer stops being comfortable, as the panel's reference line.
 *
 * A low-water mark, not the goal: the engines here are tuned to buffer 120 s
 * ahead (video-engine.ts FORWARD_BUFFER_SEC), so a healthy stream sits far above
 * this. 10 s is Shaka's own default `bufferingGoal` - the level the library
 * considers merely adequate - which makes a trace sagging toward it the earliest
 * honest warning that the connection is losing.
 */
const LOW_BUFFER_SEC = 10;

/**
 * The live numeric series the panel charts.
 *
 * Bandwidth and bitrate SHARE a chart, because they share a unit and because the
 * gap between them is the actual diagnostic: while the connection is delivering
 * more than the stream is asking for there is slack, and when the two meet the
 * stream is about to stall. As two independently auto-scaled sparklines - which
 * is what they were - that relationship was invisible, and each one's wobble was
 * scaled up to look alarming no matter how steady the stream was.
 *
 * Buffer keeps its own chart: it is seconds, not kb/s, and putting it on the same
 * axis as a number ~3000x larger would flatten it to a dead line.
 *
 * No colours are set here. The panel assigns them from the design system's
 * validated series palette, which is checked as a SET (adjacent contrast, and
 * separation under each kind of colourblindness); hand-picking one per call site
 * is how a set stops being a set.
 */
function buildMeters(s: WebStatsInput, m: StatsMetrics): PlayerMeter[] {
  const meters: PlayerMeter[] = [];
  const eng = s.engine;
  // Bandwidth first: it is the upper series of the pair, and the one that owns
  // the band drawn between them.
  if (eng?.estBandwidthKbps) {
    meters.push({
      key: 'bandwidth',
      label: s.t('stats.bandwidth'),
      value: eng.estBandwidthKbps,
      display: kbps(eng.estBandwidthKbps) ?? '-',
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
      display: kbps(eng.streamBitrateKbps) ?? '-',
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

/**
 * Build the "stats for nerds" snapshot (§9) for the shared StatsPanel from the
 * web `<video>` + HLS internals. The headline fields map to PlayerStats; the HLS
 * transport diagnostics ride in `extra`; the live series ride in `meters`.
 */
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
