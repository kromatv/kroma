// The KROMA brand intro, shown once per browser session before the app.
// Client-only: Audio() and sessionStorage don't exist during SSR, so it
// renders nothing until the first client effect decides whether it should
// play (avoids a hydration mismatch).

import { KromaIntro } from '@kromatv/ui/kit';
import { useState, useSyncExternalStore } from 'react';

const SEEN_KEY = 'kroma:intro-seen';

const subscribeNever = () => () => {};
const readNever = () => false;

function readUnseen() {
  try {
    return !sessionStorage.getItem(SEEN_KEY);
  } catch {
    return true;
  }
}

export function Intro() {
  const [done, setDone] = useState(false);
  const unseen = useSyncExternalStore(subscribeNever, readUnseen, readNever);

  if (!unseen || done) return null;

  return (
    <KromaIntro
      onDone={() => {
        try {
          sessionStorage.setItem(SEEN_KEY, '1');
        } catch {
          /* ignore */
        }
        setDone(true);
      }}
    />
  );
}
