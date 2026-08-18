import type { AudioTrack } from '@kroma/core';
import type { ColorValue } from '#ui/core';

/**
 * The unified player contract. ONE `<Player>` chrome (packages/ui/src/player)
 * serves both web and TV; each platform provides a `PlayerController` that
 * adapts its engine hook (web `useVideoPlayback`, TV `useDirectPlayback`) plus
 * its app-level state (subtitle selection, generation, resume...) to this shape.
 * The chrome never talks to an engine directly, only through the controller.
 */

/**
 * Per-platform capability flags. A `false` flag removes BOTH the cluster button
 * AND its D-pad focus stop, so there is never a dead button or a trapped focus
 * (see `usePlayerNav`). Everything else is common to every platform.
 */
export interface PlayerFlags {
  /** Volume slider + mute (web). TV delegates volume to the set / amp remote. */
  volume: boolean;
  /** Picture-in-Picture floating window (web). No windowing on TV. */
  pip: boolean;
  /** Fullscreen toggle (web). A TV is already fullscreen. */
  fullscreen: boolean;
  /** "Play this on a TV". Set by the senders (web, and the phone if it ever
   *  adopts this chrome) and only while a receiver is actually live - a TV is
   *  the screen a film is cast TO, never from. */
  cast?: boolean;
  /** A fine pointer drives the chrome (reveal-on-move). Off on TVs: a Samsung /
   *  magic-remote cursor emits phantom `pointermove` events that would otherwise
   *  keep the chrome (title + controls) revealed forever instead of auto-hiding. */
  pointer: boolean;
}

export const WEB_FLAGS: PlayerFlags = {
  volume: true,
  pip: true,
  fullscreen: true,
  pointer: true,
};
export const TV_FLAGS: PlayerFlags = {
  volume: false,
  pip: false,
  fullscreen: false,
  pointer: false,
};

/** Why the player asked to be closed: `close` is the chrome's own back control,
 *  `back` the remote's Back button (and the key a browser TV shell delivers it
 *  as), `stop` the remote's Stop media key. */
export type PlayerCloseReason = 'close' | 'back' | 'stop';

export interface PlayerCloseDetails {
  reason: PlayerCloseReason;
}

/** A subtitle track as the chrome needs it (embedded, downloaded or AI-made). */
export interface PlayerSub {
  index: number;
  language: string | null;
  /** Human label (AI tracks carry their own; else derived from the language). */
  label?: string | null;
  codec: string;
  /** Resolved WebVTT url the renderer fetches (absent for picture subs). */
  url?: string | null;
  /** AI-generated (Whisper / translate) track → violet "IA" treatment. */
  ai?: boolean;
  /** false = a picture sub (PGS/VobSub) we cannot render as text → disabled. */
  selectable: boolean;
  /** Deletable generated-track id (present only for AI tracks). */
  subId?: string | null;
}

/** Volume-normalizer modes (§7). `night` clamps loud peaks hard. */
export type AudioFilterMode = 'off' | 'standard' | 'night' | 'boost';

/** A quality option (§5 Settings). The server is remux-only, so this reflects
 *  the SOURCE (one honest "Auto · <source>" entry) rather than a fake ladder. */
export interface PlayerQuality {
  id: string;
  label: string;
  /** Second line under the label, for what the entry actually does. */
  note?: string;
}

/** One chapter segment on the progress bar (§1). */
export interface Chapter {
  startMs: number;
  endMs: number;
  title: string;
  /** Marker origin, for the coloured intro/credits treatment when derived. */
  kind?: 'intro' | 'credits' | 'chapter';
}

/** One live numeric series for the stats panel's charts. `value` is the
 * instantaneous sample the panel appends to its own rolling history; `display`
 * is the already-formatted current value shown beside the graph. */
export interface PlayerMeter {
  /** Stable id keying the panel's per-series history (never localized). */
  key: string;
  /** Localized row label. */
  label: string;
  /** Instantaneous numeric sample (the chart is auto-scaled to its window). */
  value: number;
  /** Formatted current value, e.g. "8.20 Mb/s". */
  display: string;
  /** Stroke colour for the trace (CSS colour). Defaults to the series palette
   *  slot for this meter's position, which is what a builder should usually let
   *  happen - the palette is validated as a set. */
  color?: ColorValue;
  /**
   * Meters sharing a `chart` id are drawn on ONE axis, in the order given.
   *
   * Only ever group meters that share a UNIT. Two scales on one axis invent a
   * crossover that is not in the data, which is why buffer (seconds) has its own
   * chart while bandwidth and bitrate (both kb/s) share one - there, the gap
   * between them IS the diagnostic. A meter that names no chart gets its own.
   */
  chart?: string;
  /**
   * Localized heading for a shared chart, set on its FIRST meter.
   *
   * Without one the chart heads itself with its series' labels joined, which is
   * honest but runs long the moment there are two of them ("Bandwidth est. ·
   * Stream bitrate" truncates in the space available). A pair that shares an axis
   * usually has a name covering both - throughput, for these two.
   */
  chartLabel?: string;
  /**
   * A horizontal reference line, in the series' own unit: the level at which the
   * number stops being healthy. Without one an auto-scaled trace says how a
   * value is MOVING but never whether it is fine, which is the question a
   * diagnostics panel is open to answer.
   */
  reference?: { value: number; label: string };
  /**
   * Fill the region between this meter and the next one in the same chart.
   * Set on the upper series of a capacity/demand pair (bandwidth over bitrate):
   * while the band is open there is slack, and when it closes the stream stalls.
   */
  band?: boolean;
}

/** Live "stats for nerds" snapshot (§9). All optional: TV fills what it can. */
export interface PlayerStats {
  resolution?: string;
  videoCodec?: string;
  fps?: string;
  dropped?: string;
  audioFormat?: string;
  bitrate?: string;
  buffer?: string;
  mode?: string;
  /** Platform-specific rows, already localized. `group` sorts them into titled
   *  blocks in the panel - the web reports twenty of these, and twenty rows in
   *  one list is a wall. Rows with no group stay with the headline fields, so a
   *  builder that names none renders exactly as it always did. */
  extra?: { label: string; value: string; group?: string }[];
  /** Live numeric series, drawn as charts above the text rows. Meters sharing a
   *  `chart` id land on one axis; see PlayerMeter. */
  meters?: PlayerMeter[];
}

/** The video surface kind the controller drives. `video` = an in-page element;
 *  the others render to a native plane BEHIND a transparent page. */
export type PlayerSurface = 'video' | 'avplay' | 'mpv' | 'exo' | 'vlc';

/** A video-plane rectangle in viewport FRACTIONS [0,1] (`x,y` = top-left corner,
 *  `w,h` = size). Used to shrink a NATIVE plane (AVPlay / mpv / ExoPlayer) into
 *  the settings card - those can't be CSS-transformed like an in-page <video>. */
export interface PlaneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Everything the shared chrome reads or drives. Values marked "(web)" are no-ops
 * / stable falses on TV (their flag is off, so the chrome never surfaces them).
 */
export interface PlayerController {
  cur: number;
  dur: number;
  bufEnd: number;
  /** Pending scrub target while dragging / D-pad seeking; null when settled. */
  seekPreview: number | null;

  playing: boolean;
  waiting: boolean;
  ready: boolean;
  /** Already-localized warning/error string, or null. */
  error: string | null;
  /** Bumps once each time playback reaches the natural end (autoplay trigger). */
  endedNonce: number;
  surface: PlayerSurface;

  togglePlay(): void;
  /** Seek to an absolute position (seconds). */
  seekTo(abs: number): void;
  /** Relative skip (seconds); negative = back. */
  skip(delta: number): void;

  // Scrub gesture (absolute seconds; shared by pointer + D-pad).
  scrubPreview(abs: number | null): void;
  scrubCommit(): void;

  volume: number;
  muted: boolean;
  setVolume(v: number): void;
  toggleMute(): void;

  rate: number;
  setRate(r: number): void;

  audioTracks: AudioTrack[];
  audioIndex: number;
  setAudio(index: number): void;

  subtitles: PlayerSub[];
  subtitleIndex: number | null;
  setSubtitle(index: number | null): void;

  qualities: PlayerQuality[];
  qualityId: string;
  setQuality(id: string): void;

  // The engine picker (web: manual override of the auto direct/HLS decision).
  // Absent on platforms with no in-player picker (e.g. TV, which offers the
  // engine in its profile menu), so the Settings row hides itself.
  engines?: PlayerQuality[];
  engineId?: string;
  setEngine?(id: string): void;

  audioFilter: AudioFilterMode;
  setAudioFilter(mode: AudioFilterMode): void;
  audioFilterSupported: boolean;

  pipActive: boolean;
  togglePip(): void;
  fullscreen: boolean;
  toggleFullscreen(): void;

  /** Resize the NATIVE video plane (TV: AVPlay / mpv / ExoPlayer) to a
   *  fraction-rect, or `null` for fullscreen. Lets the chrome shrink the plane
   *  into the settings card (YouTube-style), since a hardware plane behind the
   *  page can't be CSS-transformed. Absent for an in-page <video> surface, which
   *  the chrome shrinks with a CSS transform. */
  setPlaneRect?(rect: PlaneRect | null): void;

  getStats(): PlayerStats;
}
