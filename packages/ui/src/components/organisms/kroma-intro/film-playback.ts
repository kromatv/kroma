import { HIDDEN_RECHECKS, SAFETY_MS, SAFETY_SLACK_MS } from './constants';

type PlayResult = Promise<void> | undefined;

function onRefused(result: PlayResult, refused: (error: unknown) => void): void {
  if (typeof result?.then === 'function') {
    result.catch(refused);
  }
}

function whenPlayable(v: HTMLVideoElement, run: () => void): void {
  if (v.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    run();
    return;
  }
  const ready = () => {
    v.removeEventListener('canplay', ready);
    run();
  };
  v.addEventListener('canplay', ready);
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Plays with sound, and muted once the browser refuses sound; `refused` runs
 * when it refuses muted playback too. A `play()` interrupted by the film's own
 * loading is not a refusal of sound, so it is retried once the film can play.
 */
export function playSoundFirst(v: HTMLVideoElement, refused: () => void, retries = 1): void {
  onRefused(v.play(), (error) => {
    if (isAbort(error) && retries > 0) {
      whenPlayable(v, () => playSoundFirst(v, refused, retries - 1));
    } else {
      v.muted = true;
      onRefused(v.play(), refused);
    }
  });
}

/** Plays from the first frame. */
export function restart(v: HTMLVideoElement): void {
  if (v.readyState > HTMLMediaElement.HAVE_NOTHING) {
    v.currentTime = 0;
  }
  onRefused(v.play(), () => undefined);
}

/**
 * Runs `start` now, or once the page is first shown when it opens hidden:
 * Chrome defers a hidden tab's media loading, which would stall the film until
 * the safety timer spent it. Returns what cancels the wait.
 */
export function whenVisible(start: () => void): () => void {
  if (!document.hidden) {
    start();
    return () => undefined;
  }
  const shown = () => {
    if (!document.hidden) {
      document.removeEventListener('visibilitychange', shown);
      start();
    }
  };
  document.addEventListener('visibilitychange', shown);
  return () => document.removeEventListener('visibilitychange', shown);
}

interface StallSafety {
  video: { readonly current: HTMLVideoElement | null };
  arm: (ms: number, run: () => void) => void;
  exit: () => void;
}

/**
 * Arms the timer that ends a stalled film: its own length plus slack, or
 * {@link SAFETY_MS} before its metadata. A page still hidden with nothing
 * loaded gets the window again, {@link HIDDEN_RECHECKS} times at most.
 */
export function armStallSafety(safety: StallSafety, rechecksLeft = HIDDEN_RECHECKS): void {
  const d = safety.video.current?.duration;
  const ms = d && Number.isFinite(d) && d > 0 ? d * 1000 + SAFETY_SLACK_MS : SAFETY_MS;
  safety.arm(ms, () => {
    const parked = document.hidden && safety.video.current?.readyState === 0;
    if (parked && rechecksLeft > 0) {
      armStallSafety(safety, rechecksLeft - 1);
    } else {
      safety.exit();
    }
  });
}
