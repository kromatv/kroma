import type { Engine } from './engine/engine';

// The panel reads the locales through React, which polls for them and spins
// forever on an answer that is equal but never the same.
const LOCALES: readonly string[] = ['fr', 'en'];

/** An engine for a test to inspect: the smallest one that answers. */
export function testEngine(over: Partial<Engine> = {}): Engine {
  return {
    name: 'test',
    locales: () => LOCALES,
    activeLocale: () => 'fr',
    inspect: () => {},
    overrideLocale: () => {},
    ...over,
  };
}
