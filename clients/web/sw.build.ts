import { fileURLToPath } from 'node:url';
import type { StandaloneScriptOptions } from '@kroma/bundler/standalone-script';

/**
 * How the Web Push service worker is compiled.
 *
 * Named here rather than inline in the Vite config so `src/sw.test.ts` can
 * compile the artefact that actually ships. The bug this whole line of work
 * traces back to was a target regression — Tizen shipping `?.` to an engine
 * that could not parse it — and a test on a second, hand-copied target would
 * not have caught it.
 */
export const swScript: StandaloneScriptOptions = {
  entry: fileURLToPath(new URL('./src/sw.ts', import.meta.url)),
  outfile: fileURLToPath(new URL('./public/sw.js', import.meta.url)),
  // A service worker only ever runs in a browser new enough to have one, so the
  // floor is what those engines parse rather than anything about old TVs.
  esbuild: { target: ['chrome90', 'firefox90', 'safari15'] },
};
