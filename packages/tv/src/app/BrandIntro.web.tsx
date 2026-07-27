import { KromaIntro } from '@kroma/ui/kit';
import { useState } from 'react';

export interface BrandIntroProps {
  /** Shell-bundled override for the brand-intro film. */
  videoSrc?: string;
}

// The brand intro plays once per launch. sessionStorage survives Vite HMR (so dev
// reloads don't replay it) but is fresh on a real TV cold-start.
const INTRO_SEEN_KEY = 'kroma:intro-seen';
const introAlreadySeen = (() => {
  try {
    return sessionStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
})();

/**
 * The cinematic brand intro, web (Tizen / webOS / desktop / browser): the
 * bundled film over the app, which fades to it when the film ends or is
 * skipped. An overlay, not a gate the app tree is already mounted behind it.
 */
export function BrandIntro({ videoSrc }: Readonly<BrandIntroProps>) {
  const [done, setDone] = useState(introAlreadySeen);
  if (done) return null;
  return (
    <KromaIntro
      lite
      videoSrc={videoSrc}
      onDone={() => {
        try {
          sessionStorage.setItem(INTRO_SEEN_KEY, '1');
        } catch {
          /* ignore */
        }
        setDone(true);
      }}
    />
  );
}
