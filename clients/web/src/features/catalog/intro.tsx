// The KROMA brand intro, shown once per browser session before the app.
// Client-only: Audio() and sessionStorage don't exist during SSR, so it
// renders nothing until the first client effect decides whether it should
// play (avoids a hydration mismatch).

import { KromaIntro } from '@kroma/ui/kit';
import { useEffect, useState } from 'react';

const SEEN_KEY = 'kroma:intro-seen';

export function Intro() {
  const [show, setShow] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      if (!sessionStorage.getItem(SEEN_KEY)) setShow(true);
    } catch {
      setShow(true); // private mode / storage blocked → still play it once.
    }
  }, []);

  if (!mounted || !show) return null;

  return (
    <KromaIntro
      onDone={() => {
        try {
          sessionStorage.setItem(SEEN_KEY, '1');
        } catch {
          /* ignore */
        }
        setShow(false);
      }}
    />
  );
}
