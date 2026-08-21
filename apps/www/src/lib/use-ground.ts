import { useEffect, useState } from 'react';
import { type Ground, readGround, watchGround } from '#site/lib/ground';

/**
 * The ground the page is on, live. Dark until the effect runs: the prerendered
 * HTML knows no visitor, so a render-time read would make hydration disagree
 * with it, and dark is the product's default anyway.
 */
export function useGround(): Ground {
  const [ground, setGround] = useState<Ground>('dark');

  useEffect(() => {
    const sync = () => setGround(readGround(document.documentElement));
    sync();
    return watchGround(sync);
  }, []);

  return ground;
}
