import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { DEFAULT_AUDIO, SAFETY_MS } from './constants';
import { IntroScene } from './intro-scene';
import { IntroShell } from './intro-shell';
import { useIntroExit } from './use-intro-exit';
import { useIntroKeys } from './use-intro-keys';

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
  const { exiting, armSafety, exit, reopen, clearTimers } = useIntroExit(onDone);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const start = useEffectEvent(() => {
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
    if (!loop) armSafety(SAFETY_MS, exit);
  });

  const replay = useEffectEvent(() => {
    setRunId((n) => n + 1);
    start();
  });

  // Autoplay may have blocked the sting; the first gesture is allowed to start it.
  const unblock = useEffectEvent(() => {
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
  });

  const onEnded = useEffectEvent(() => {
    if (loop) replay();
    else exit();
  });

  useIntroKeys({ exit, replay, unblock });

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only intro timeline; arm audio once. clearTimers is a stable useCallback and the rest are effect events, all intentionally omitted so the effect never re-arms (which would restart the sting) on unrelated re-renders.
  useEffect(() => {
    const a = new Audio(DEFAULT_AUDIO);
    a.preload = 'auto';
    audioRef.current = a;

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
