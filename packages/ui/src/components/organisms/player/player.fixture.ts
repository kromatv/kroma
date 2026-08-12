// A standing-still player controller for the workbench: every method is a
// no-op with plausible numbers, so a story can render chrome that needs a
// `PlayerController` without any video to play. Overrides via `fakeController({...})`.

import type { AudioTrack } from '@kroma/core';
import type { StoryboardTile } from '#ui/services/storyboard';
import type {
  AudioFilterMode,
  Chapter,
  PlayerController,
  PlayerQuality,
  PlayerStats,
  PlayerSub,
} from './types';

const AUDIO_TRACKS: AudioTrack[] = [
  { index: 0, codec: 'truehd', channels: 8, language: 'eng', title: 'TrueHD 7.1', default: true },
  { index: 1, codec: 'ac3', channels: 6, language: 'fra', title: 'AC3 5.1', default: false },
];

const SUBTITLES: PlayerSub[] = [
  {
    index: 0,
    language: 'eng',
    label: 'English (SDH)',
    codec: 'subrip',
    url: null,
    selectable: true,
  },
  { index: 1, language: 'fra', label: 'Français', codec: 'subrip', url: null, selectable: true },
  // An AI track, so the violet treatment is visible in the picker.
  {
    index: 2,
    language: 'spa',
    label: 'Español (IA)',
    codec: 'webvtt',
    url: null,
    ai: true,
    selectable: true,
  },
];

const QUALITIES: PlayerQuality[] = [{ id: 'auto', label: 'Auto · 2160p HEVC' }];

/** Shaped like the web player's stats (see web-stats.ts): the richest producer,
 * so grouped blocks and sparklines have real data to render. */
function fullStats(tick: number): PlayerStats {
  // Deterministic in `tick` so two screenshots of the same frame are identical.
  const wave = (period: number, phase = 0) => Math.sin(tick / period + phase);
  const buffer = 24.8 + wave(9) * 4.2;
  const bandwidth = 84_000 + wave(7, 1.2) * 12_000;
  const bitrate = 58_400 + wave(5, 0.4) * 5_600;
  const dropped = 3 + Math.floor(tick / 240);
  const frames = 84_120 + tick * 24;

  return {
    mode: 'Direct · HEVC passthrough',
    resolution: '3840×2160',
    videoCodec: 'HEVC Main 10 10-bit HDR',
    fps: '23.98 fps',
    audioFormat: 'TRUEHD 8.0 (eng)',
    bitrate: `${(bitrate / 1000).toFixed(2)} Mb/s`,
    buffer: `${buffer.toFixed(1)} s ahead`,
    dropped: `${dropped} / ${frames}`,
    extra: [
      { group: 'Media', label: 'Title', value: 'Blade Runner 2049' },
      { group: 'Media', label: 'Container', value: 'MKV' },
      { group: 'Media', label: 'Position', value: `${clockOf(2_940 + tick)} · rel 2940s` },
      { group: 'Media', label: 'Size', value: '61.42 Go' },
      { group: 'Media', label: 'Display', value: '3840×2160 @2x' },
      { group: 'Transport', label: 'Stream bitrate', value: `${(bitrate / 1000).toFixed(2)} Mb/s` },
      { group: 'Transport', label: 'Bandwidth', value: `${(bandwidth / 1000).toFixed(2)} Mb/s` },
      { group: 'Transport', label: 'Stalls', value: '1 (0.8s)' },
      { group: 'Transport', label: 'Downloaded', value: `${(12.4 + tick / 40).toFixed(2)} Go` },
      { group: 'Transport', label: 'Codecs', value: 'hvc1.2.4.L153.B0 / mlpa' },
      { group: 'Client', label: 'State', value: 'HAVE_ENOUGH · NET_IDLE' },
      { group: 'Client', label: 'Connection', value: '9.4 Mb/s · 4g' },
      { group: 'Client', label: 'Volume', value: '100%' },
      { group: 'Client', label: 'Speed', value: '1.00×' },
    ],
    meters: liveMeters({ bandwidth, bitrate, buffer }),
  };
}

/** Shaped exactly as the web builder emits (see web-stats.ts). No colours -
 * the panel assigns those from the validated series palette. Shared with
 * StatsPanel.stories so the two fixtures cannot drift apart. */
function liveMeters(at: {
  bandwidth: number;
  bitrate: number;
  buffer: number;
}): NonNullable<PlayerStats['meters']> {
  return [
    {
      key: 'bandwidth',
      label: 'Bandwidth',
      value: at.bandwidth,
      display: `${(at.bandwidth / 1000).toFixed(2)} Mb/s`,
      chart: 'throughput',
      chartLabel: 'Throughput',
      band: true,
    },
    {
      key: 'bitrate',
      label: 'Stream bitrate',
      value: at.bitrate,
      display: `${(at.bitrate / 1000).toFixed(2)} Mb/s`,
      chart: 'throughput',
    },
    {
      key: 'buffer',
      label: 'Buffer',
      value: at.buffer,
      display: `${at.buffer.toFixed(1)} s ahead`,
      reference: { value: 10, label: '10 s ahead' },
    },
  ];
}

function clockOf(sec: number): string {
  const whole = Math.max(0, Math.floor(sec));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function livePlayerStats(): () => PlayerStats {
  let tick = 0;
  return () => fullStats(tick++);
}

/** The lean end of the range: a native TV plane, which exposes no decode
 * counters at all. */
const TV_STATS: PlayerStats = {
  mode: 'Direct play',
  resolution: '3840×2160',
  videoCodec: 'HEVC 10-bit HDR',
  audioFormat: 'EAC3 5.0 (fra)',
  buffer: '24.8 s ahead',
  extra: [
    { label: 'Title', value: 'Blade Runner 2049' },
    { label: 'Container', value: 'MKV' },
    { label: 'Position', value: '2940s / 9840s' },
  ],
};

/** A controller that reports a paused 4K session and ignores every command.
 * Overrides are shallow-merged: `fakeController({ playing: true, cur: 1284 })`. */
function fakeController(over: Partial<PlayerController> = {}): PlayerController {
  const noop = () => undefined;
  return {
    cur: 164,
    dur: 9840,
    bufEnd: 420,
    seekPreview: null,

    playing: false,
    waiting: false,
    ready: true,
    error: null,
    endedNonce: 0,
    surface: 'video',

    togglePlay: noop,
    seekTo: noop,
    skip: noop,
    scrubPreview: noop,
    scrubCommit: noop,

    volume: 0.7,
    muted: false,
    setVolume: noop,
    toggleMute: noop,

    rate: 1,
    setRate: noop,

    audioTracks: AUDIO_TRACKS,
    audioIndex: 0,
    setAudio: noop,

    subtitles: SUBTITLES,
    subtitleIndex: null,
    setSubtitle: noop,

    qualities: QUALITIES,
    qualityId: 'auto',
    setQuality: noop,

    audioFilter: 'off' as AudioFilterMode,
    setAudioFilter: noop,
    audioFilterSupported: true,

    pipActive: false,
    togglePip: noop,
    fullscreen: false,
    toggleFullscreen: noop,

    getStats: livePlayerStats(),
    ...over,
  };
}

/** A storyboard tile at a position, for the seek preview. No real sprite sheet
 * in a workbench, so each bucket of the film uses a different still as a
 * single-tile sheet. `scale` is display size over source size: the sheet must
 * be drawn at its own pixel size and scaled as a layer, not decoded at
 * `sheetWidth * scale` (that silently produces a black preview on TV; see
 * StoryboardThumb). */
function fakeTileAt(sheets: readonly string[], width = 220) {
  const SOURCE_W = 640;
  const SOURCE_H = 360;
  return (sec: number): StoryboardTile => {
    const bucket = Math.floor(sec / 1200) % sheets.length;
    return {
      width,
      height: Math.round((width * SOURCE_H) / SOURCE_W),
      sheet: sheets[Math.max(0, bucket)] as string,
      sheetWidth: SOURCE_W,
      sheetHeight: SOURCE_H,
      offsetX: 0,
      offsetY: 0,
      scale: width / SOURCE_W,
    };
  };
}

const CHAPTERS: Chapter[] = [
  { startMs: 0, endMs: 96_000, title: 'Cold open', kind: 'intro' },
  { startMs: 96_000, endMs: 2_760_000, title: 'Act one', kind: 'chapter' },
  { startMs: 2_760_000, endMs: 5_940_000, title: 'Act two', kind: 'chapter' },
  { startMs: 5_940_000, endMs: 9_180_000, title: 'Act three', kind: 'chapter' },
  { startMs: 9_180_000, endMs: 9_840_000, title: 'Credits', kind: 'credits' },
];

export {
  AUDIO_TRACKS,
  CHAPTERS,
  fakeController,
  fakeTileAt,
  fullStats,
  liveMeters,
  livePlayerStats,
  QUALITIES,
  SUBTITLES,
  TV_STATS,
};
