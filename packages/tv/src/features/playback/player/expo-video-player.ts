import { nativeBufferBudget, nativePlayerPlane } from '@kromatv/ui/native-player';
import { createVideoPlayer, type VideoPlayer } from 'expo-video';

type DebugRow = { label: string; value: string };

type VideoTrack = NonNullable<VideoPlayer['videoTrack']>;

// What the platform player is actually made of, so the stats panel names the
// same thing the logs do.
const PLANE: string = nativePlayerPlane();

// The chrome interpolates between reports, so a coarser interval than the
// frame rate is plenty and costs less.
const TIME_UPDATE_SEC = 0.25;

// Long enough for React to have re-rendered the surface onto the successor,
// short enough that nobody notices the memory.
const RETIRE_MS = 1000;

const tryRead = <T>(get: () => T): T | null => {
  try {
    return get();
  } catch {
    return null;
  }
};

/** A platform player for `url`, held to this platform's buffer budget, which
 * survives `replace`, so a re-anchor keeps the bounds the player opened with. */
export function createPlayer(url: string): VideoPlayer {
  const player = createVideoPlayer({ uri: url });
  player.timeUpdateEventInterval = TIME_UPDATE_SEC;
  const budget = nativeBufferBudget();
  if (budget) {
    player.bufferOptions = budget;
  }
  return player;
}

function stop(player: VideoPlayer): void {
  try {
    player.pause();
  } catch {
    // no-op: already gone.
  }
}

function free(player: VideoPlayer): void {
  try {
    player.release();
  } catch {
    // no-op: released elsewhere, or the app is tearing down.
  }
}

/**
 * Pauses `player` now and releases it a second later. Releasing immediately is
 * a use-after-free: `<VideoView>` still holds this player as a prop until React
 * re-renders, and handing a released expo shared object to a native prop throws
 * mid-commit, freezing the UI with the film still playing behind it.
 */
export function retirePlayer(player: VideoPlayer): void {
  stop(player);
  setTimeout(() => free(player), RETIRE_MS);
}

/**
 * Pauses and releases `player` at once, for an ENGINE going away rather than one
 * of its players: there is no successor `<VideoView>` to wait for, and whatever
 * replaces this engine opens its own decoder at once. A second of both resident
 * is what the low-memory killer takes the app for on a 2 GB set, and a libVLC
 * core carrying a software decoder is the worst possible thing to hold it next to.
 */
export function releasePlayer(player: VideoPlayer): void {
  stop(player);
  free(player);
}

/**
 * Reads a number off a player that may already be released. A released
 * expo-video player throws on property access rather than returning stale data;
 * thrown from an event callback that used to unmount the player mid-film and drop
 * the viewer back to the home screen on Apple TV. Answers 0 then.
 */
export function readPlayerNumber(read: () => number): number {
  try {
    const value = read();
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function trackRows(track: VideoTrack): DebugRow[] {
  const bitrate = track.peakBitrate ?? track.averageBitrate;
  const rows: Array<DebugRow | null> = [
    track.mimeType ? { label: 'Track', value: track.mimeType } : null,
    track.size.width > 0
      ? { label: 'Track size', value: `${track.size.width}×${track.size.height}` }
      : null,
    track.frameRate ? { label: 'Frame rate', value: `${track.frameRate.toFixed(2)} fps` } : null,
    bitrate ? { label: 'Bitrate', value: `${(bitrate / 1e6).toFixed(1)} Mb/s` } : null,
    track.videoRange ? { label: 'Range', value: track.videoRange } : null,
    track.isSupported ? null : { label: 'Decoder', value: 'unsupported' },
  ];
  return rows.filter((row) => row !== null);
}

/**
 * The stats panel's rows for `player`: only what the platform player actually
 * answered. A field it left null is left out rather than drawn as a zero, which
 * would read as a measurement. `isSupported` is the one worth reading twice - it
 * is the device saying it has no decoder for this track, which is the difference
 * between a slow picture and no picture at all.
 */
export function playerDebugRows(player: VideoPlayer | null): DebugRow[] {
  const rows = [{ label: 'Plane', value: PLANE }];
  if (!player) {
    return rows;
  }
  const status = tryRead(() => player.status);
  if (status) {
    rows.push({ label: 'Player state', value: status });
  }
  const rate = tryRead(() => player.playbackRate);
  if (rate != null && rate !== 1) {
    rows.push({ label: 'Rate', value: `${rate}x` });
  }
  const track = tryRead(() => player.videoTrack);
  return track ? [...rows, ...trackRows(track)] : rows;
}
