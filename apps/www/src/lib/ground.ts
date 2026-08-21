export type Ground = 'light' | 'dark';

const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

/** The ground the element stands on, read from the cascade so a visitor's own
 *  `[data-theme]` and the OS default are one answer. Anything unreadable is
 *  dark, the product's default. */
export function readGround(el: Element): Ground {
  const found = HEX.exec(getComputedStyle(el).getPropertyValue('--kroma-bg').trim());
  if (!found) return 'dark';
  const [r = 0, g = 0, b = 0] = found.slice(1).map((pair) => Number.parseInt(pair, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? 'light' : 'dark';
}

export function watchGround(onChange: () => void): () => void {
  const scheme = matchMedia('(prefers-color-scheme: light)');
  scheme.addEventListener('change', onChange);
  const stamp = new MutationObserver(onChange);
  stamp.observe(document.documentElement, { attributeFilter: ['data-theme'] });
  return () => {
    scheme.removeEventListener('change', onChange);
    stamp.disconnect();
  };
}
