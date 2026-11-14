import { useSyncExternalStore } from 'react';

/** The ground a page is painted on. */
export type Ground = 'dark' | 'light';

const LIGHT = '(prefers-color-scheme: light)';

function read(): Ground {
  const stated = document.documentElement.dataset.theme;
  if (stated === 'light' || stated === 'dark') return stated;
  return window.matchMedia(LIGHT).matches ? 'light' : 'dark';
}

function subscribe(changed: () => void): () => void {
  const system = window.matchMedia(LIGHT);
  const stated = new MutationObserver(changed);
  system.addEventListener('change', changed);
  stated.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => {
    system.removeEventListener('change', changed);
    stated.disconnect();
  };
}

/** The ground this page is on right now: the one the person chose, else the
 * system's. The kit paints the two through CSS alone, so a value that is not a
 * token, such as another brand's colour, has to ask. */
export function useGround(): Ground {
  return useSyncExternalStore(subscribe, read, () => 'dark');
}
