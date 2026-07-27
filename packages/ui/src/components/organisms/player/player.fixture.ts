// A standing-still player, for the workbench.
//
// The player chrome is driven by ONE object: a `PlayerController` the surface
// implements (an in-page <video> on the web, AVPlay / mpv / ExoPlayer behind a
// transparent page on a television). That is the right shape for the app - the
// chrome knows nothing about how playback works - but it is also why several of
// these components had no story: `<StatsPanel>` and `<SettingsPanel>` cannot
// render without a controller, and a workbench has no video to play.
//
// So this is a controller that does nothing, with plausible numbers in it. Every
// method is a no-op, which is exactly right for a component gallery: pressing
// Play in a story should show the pressed state, not start a film that does not
// exist. Anything a story wants to vary is passed through `fakeController({...})`.

import type { AudioTrack } from '@kroma/core';
import type { StoryboardTile } from '#ui/services/storyboard';
import type {
  AudioFilterMode,
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

/**
 * A full snapshot, of the shape the WEB player builds (see
 * clients/web/src/features/playback/web-stats.ts): the headline fields, the
 * transport and client diagnostics in `extra`, and the live series in `meters`.
 *
 * It is the web's because that is the richest producer there is - a native TV
 * plane exposes no decode counters and reports a third of this. Showing the lean
 * version in the workbench meant the panel's own features (grouped blocks,
 * sparklines) had nothing to render, and a component nobody can see is a
 * component nobody maintains. The lean case is a scene of the story instead.
 */
function fullStats(tick: number): PlayerStats {
  // A slow wander around plausible values, so the sparklines draw a trace rather
  // than a flat line. Deterministic in `tick` (the panel polls twice a second),
  // so two screenshots of the same frame are identical.
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

/**
 * The three live series, shaped exactly as the web builder emits them (see
 * web-stats.ts): the two kb/s series share one axis with bandwidth owning the
 * band between them, and buffer gets its own chart plus the low-water line.
 *
 * No colours - the panel assigns those from the validated series palette, and a
 * fixture that pinned its own would stop the workbench showing what ships.
 *
 * Shared with StatsPanel.stories, which had grown a byte-identical copy: two
 * fixtures drifting apart is two different answers to "what does the panel
 * actually look like", which is the one question a workbench exists to answer.
 */
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

/** `H:MM:SS`, for the fixture's position row. */
function clockOf(sec: number): string {
  const whole = Math.max(0, Math.floor(sec));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** The panel polls `getStats()` twice a second; each call advances the fixture's
 * clock, which is what makes the sparklines move in a workbench with no video. */
function livePlayerStats(): () => PlayerStats {
  let tick = 0;
  return () => fullStats(tick++);
}

/** The lean end of the range: a native TV plane, which exposes no decode
 * counters and no engine transport at all. */
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

/**
 * A controller that reports a paused 4K session and ignores every command.
 *
 * Overrides are shallow-merged, so a story says only what it cares about:
 *
 *   fakeController({ playing: true, cur: 1284 })
 */
function fakeController(over: Partial<PlayerController> = {}): PlayerController {
  const noop = () => undefined;
  return {
    // clock: a couple of minutes into a 2h44 film
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

    // A live snapshot per controller, so each panel on screen keeps its own
    // rolling history rather than sharing one module-level clock.
    getStats: livePlayerStats(),
    ...over,
  };
}

/**
 * A storyboard tile at a position, for the seek preview.
 *
 * A real storyboard is ONE sprite sheet holding every thumbnail, and a tile is a
 * window onto it: `offsetX/Y` move the scaled sheet so the wanted frame lands in
 * the window. There is no sheet in a workbench, so each bucket of the film points
 * at a different still used as a single-tile sheet - the shape is identical, and
 * scrubbing changes the picture, which is the behaviour worth seeing.
 *
 * `scale` is display size over source size, and the sheet is drawn at its OWN
 * pixel size and then scaled as a layer: asking the decoder for
 * `sheetWidth * scale` pixels is what silently produces a black preview on a
 * television (see StoryboardThumb).
 */
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

export {
  AUDIO_TRACKS,
  fakeController,
  fakeTileAt,
  fullStats,
  liveMeters,
  livePlayerStats,
  QUALITIES,
  SUBTITLES,
  TV_STATS,
};
