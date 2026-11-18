/** The part of a ResizeObserver the frost engine uses. */
export interface SizeWatch {
  observe(target: Element): void;
  unobserve(target: Element): void;
  disconnect(): void;
}

/**
 * Calls `onResize` when an observed element changes size. An engine without
 * ResizeObserver (Chromium before 64, so Samsung's Tizen 3.0 to 5.0) gets the
 * window's resize instead, which is the only size change a television makes.
 */
export function watchSizes(
  onResize: () => void,
  Observer: (new (callback: () => void) => SizeWatch) | undefined = globalThis.ResizeObserver,
): SizeWatch {
  if (Observer) {
    return new Observer(onResize);
  }
  window.addEventListener('resize', onResize);
  return {
    observe: () => {},
    unobserve: () => {},
    disconnect: () => window.removeEventListener('resize', onResize),
  };
}
