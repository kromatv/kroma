const STALL_MS = 2000;
const MIN_AHEAD_SEC = 0.5;
const HAVE_FUTURE_DATA = 3;
const MOVED_SEC = 0.02;
const RESUMED_POLLS = 2;

/** How often [`StallWatch.observe`] expects to be fed. */
export const STALL_POLL_MS = 500;

export const STALL_NUDGE_SEC = 0.1;

/**
 * One poll of a media element. `currentTime` and `bufferedEnd` need only share a
 * clock, so either the element's own or an anchored absolute one will do.
 */
export interface StallSample {
  currentTime: number;
  bufferedEnd: number;
  paused: boolean;
  ended?: boolean;
  seeking?: boolean;
  /** The element's `readyState`, where the backend has one. A backend that
   * exposes none is taken at its buffer's word. */
  readyState?: number;
}

/** What to do about a stall, in ascending cost. */
export type StallStep = 'nudge' | 'recover' | 'restart';

const LADDER: readonly StallStep[] = ['nudge', 'nudge', 'recover', 'restart'];

/** What one sample amounts to: whether the playhead is stuck with something left
 * to play, and the rung to take about it. `step` is `null` on every sample but
 * the one that hands a rung out, which is one per `STALL_MS`. */
export interface StallVerdict {
  step: StallStep | null;
  stalled: boolean;
}

const MOVING: StallVerdict = { step: null, stalled: false };

/** Watches one element for a playhead that has stopped with buffer ahead of it.
 * The ladder resets only when playback actually resumes. */
export interface StallWatch {
  observe(sample: StallSample, nowMs: number): StallVerdict;
}

export function stallWatch(): StallWatch {
  let mark = Number.NaN;
  let since = 0;
  let taken = 0;
  let advances = 0;
  let stuck = false;

  const reset = (): void => {
    mark = Number.NaN;
    since = 0;
    taken = 0;
    advances = 0;
    stuck = false;
  };

  return {
    observe(sample, nowMs) {
      const ahead = sample.bufferedEnd - sample.currentTime;
      const idle =
        sample.paused ||
        sample.ended === true ||
        sample.seeking === true ||
        (sample.readyState ?? HAVE_FUTURE_DATA) < HAVE_FUTURE_DATA ||
        ahead < MIN_AHEAD_SEC;
      if (idle) {
        reset();
        return MOVING;
      }

      const moved = Number.isNaN(mark) || Math.abs(sample.currentTime - mark) > MOVED_SEC;
      mark = sample.currentTime;
      if (moved) {
        since = nowMs;
        stuck = false;
        advances += 1;
        if (advances >= RESUMED_POLLS) taken = 0;
        return MOVING;
      }

      advances = 0;
      // A stall persists between rungs: only movement ends it.
      if (nowMs - since < STALL_MS) return { step: null, stalled: stuck };
      stuck = true;
      const step = LADDER[taken] ?? null;
      if (step) {
        taken += 1;
        since = nowMs;
      }
      return { step, stalled: true };
    },
  };
}

// A restart re-anchors the stream, which costs a fresh remux session on the
// server (one ffmpeg per program + anchor).
const RESTART_COOLDOWN_MS = 30_000;

/**
 * Whatever is playing, as a stall driver needs it: one sample per poll, and one
 * way to carry out each rung of the ladder. `sample` answers `null` where there
 * is nothing to read yet, or where the backend reports no buffered range and so
 * cannot tell a stall from an honest rebuffer. `recover` answers `false` when it
 * has no recovery of its own and the driver should restart instead.
 */
export interface StallTarget {
  sample(): StallSample | null;
  nudge(): void;
  recover(): boolean;
  restart(): void;
}

/**
 * Polls `target` every [`STALL_POLL_MS`] and works a stuck playhead back up the
 * ladder, holding a restart to one per 30 seconds. `onStalled` is handed whether
 * the playhead is stuck with something left to play, which is what the chrome
 * shows as buffering. Returns the stop function.
 */
export function driveStallRecovery(
  target: StallTarget,
  onStalled: (stalled: boolean) => void,
): () => void {
  const watch = stallWatch();
  let restartedAt = 0;

  const apply = (step: StallStep, nowMs: number): void => {
    if (step === 'nudge') {
      target.nudge();
      return;
    }
    if (step === 'recover' && target.recover()) return;
    if (nowMs - restartedAt < RESTART_COOLDOWN_MS) return;
    restartedAt = nowMs;
    target.restart();
  };

  const id = setInterval(() => {
    const sample = target.sample();
    if (!sample) return;
    const now = Date.now();
    const { step, stalled } = watch.observe(sample, now);
    onStalled(stalled);
    if (step) apply(step, now);
  }, STALL_POLL_MS);

  return () => {
    clearInterval(id);
    onStalled(false);
  };
}

const RECOVERY_WINDOW_MS = 60_000;
const MAX_RECOVERIES = 2;

/** The Shaka slice a stall recovery drives. */
export interface ShakaRecoverable {
  retryStreaming(retryDelaySeconds?: number): boolean;
}

/**
 * The MSE recovery rung, for whichever engine is attached: ask Shaka to retry
 * the stream, else ask hls.js to recover its media error. `false` where neither
 * is attached and the caller should reach for a fresh source instead.
 */
export function recoverMse(
  shaka: ShakaRecoverable | null,
  hls: Pick<HlsInstanceLike, 'recoverMediaError'> | null,
): boolean {
  if (shaka) return shaka.retryStreaming();
  if (!hls) return false;
  hls.recoverMediaError();
  return true;
}

export interface HlsClassLike {
  Events: { ERROR: string };
  ErrorTypes: { NETWORK_ERROR: string; MEDIA_ERROR: string };
}

export interface HlsInstanceLike {
  on(
    event: string,
    listener: (event: string, data: { type: string; fatal: boolean }) => void,
  ): void;
  startLoad(): void;
  recoverMediaError(): void;
}

/**
 * Recover the fatal errors hls.js hands back to its caller. Its own action for a
 * stalled buffer is to do nothing, so an unhandled `bufferStalledError` is a
 * frozen picture over a full buffer, permanently. `onGiveUp` runs once the same
 * class of failure has survived `MAX_RECOVERIES` attempts inside a minute.
 */
export function attachHlsRecovery(
  hlsClass: HlsClassLike,
  hls: HlsInstanceLike,
  onGiveUp: () => void,
): void {
  let network = 0;
  let media = 0;
  let last = 0;

  hls.on(hlsClass.Events.ERROR, (_event, data) => {
    if (!data.fatal) return;
    const now = Date.now();
    if (now - last > RECOVERY_WINDOW_MS) {
      network = 0;
      media = 0;
    }
    last = now;
    if (data.type === hlsClass.ErrorTypes.NETWORK_ERROR && network < MAX_RECOVERIES) {
      network += 1;
      hls.startLoad();
      return;
    }
    if (data.type === hlsClass.ErrorTypes.MEDIA_ERROR && media < MAX_RECOVERIES) {
      media += 1;
      hls.recoverMediaError();
      return;
    }
    onGiveUp();
  });
}
