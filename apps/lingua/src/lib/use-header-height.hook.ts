import { createContext, useContext, useEffect } from 'react';

/** How tall Lingua's header stands, in pixels, while it is pinned to the top of the window; 0 until it is measured. */
export const HeaderHeight = createContext(0);

/** The pinned header's height, so what pins to the top of the window sits under it rather than behind it. */
export function useHeaderHeight(): number {
  return useContext(HeaderHeight);
}

/** Keeps what the browser scrolls to, a focused field or a found word, clear of a pinned header `height` pixels tall. */
export function useScrollPadding(height: number) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.scrollPaddingTop = `${height}px`;
    return () => {
      root.style.scrollPaddingTop = '';
    };
  }, [height]);
}
