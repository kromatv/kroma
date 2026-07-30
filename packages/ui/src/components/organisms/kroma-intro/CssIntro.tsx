import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_AUDIO, SAFETY_MS } from './constants';
import { IntroScene } from './IntroScene';
import { IntroShell } from './IntroShell';
import { useIntroExit } from './useIntroExit';
import { useIntroKeys } from './useIntroKeys';

export interface CssIntroProps {
  onDone: () => void;
  loop?: boolean;
  tagline?: string;
  lite?: boolean;
}

/**
 * CSS/DOM fallback intro, used when the video intro cannot play. `lite` (set by
 * the TV shells) drops the per-frame raster work a weak TV GPU cannot absorb:
 * animated `filter: blur()`, the `mix-blend-mode` grain and the sheen.
 */
export function CssIntro({ onDone, loop = false, tagline, lite = false }: Readonly<CssIntroProps>) {
  const [started, setStarted] = useState(false);
  const [runId, setRunId] = useState(0);
  const { exiting, safetyRef, exit, reopen, clearTimers } = useIntroExit(onDone);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loopRef = useRef(loop);
  loopRef.current = loop;

  const start = useCallback(() => {
    reopen();
    setStarted(false);
    const a = audioRef.current;
    // The keyframe delays are timed to the sting, so the visual timeline has to
    // start at audio onset (or its rejection).
    const begin = () => setStarted(true);
    if (a) {
      try {
        a.currentTime = 0;
      } catch {
        /* not yet seekable harmless */
      }
      const p = a.play();
      if (typeof p?.then === 'function') p.then(begin).catch(begin);
      else begin();
    } else {
      begin();
    }
    if (!loopRef.current) safetyRef.current = setTimeout(exit, SAFETY_MS);
  }, [exit, reopen, safetyRef]);

  const replay = useCallback(() => {
    setRunId((n) => n + 1);
    start();
  }, [start]);

  // Autoplay may have blocked the sting; the first gesture is allowed to start it.
  const unblock = useCallback(() => {
    const a = audioRef.current;
    if (!a?.paused) return;
    try {
      a.currentTime = 0;
    } catch {
      /* harmless */
    }
    void a
      .play()
      .then(() => setStarted(true))
      .catch(() => undefined);
  }, []);

  useIntroKeys({ exit, replay, unblock });

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only intro timeline; arm audio once. start/exit/replay are stable useCallbacks and are intentionally omitted so the effect never re-arms (which would restart the sting) on unrelated re-renders.
  useEffect(() => {
    const a = new Audio(DEFAULT_AUDIO);
    a.preload = 'auto';
    audioRef.current = a;

    const onEnded = () => {
      if (loopRef.current) replay();
      else exit();
    };
    a.addEventListener('ended', onEnded);

    start();

    return () => {
      clearTimers();
      a.pause();
      a.removeEventListener('ended', onEnded);
    };
  }, []);

  return (
    <IntroShell exiting={exiting}>
      {started ? (
        <IntroScene
          runId={runId}
          lite={lite}
          showTagline={Boolean(tagline)}
          tagline={tagline ?? ''}
        />
      ) : null}
    </IntroShell>
  );
}
