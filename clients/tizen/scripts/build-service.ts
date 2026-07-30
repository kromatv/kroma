// Emit the Smart Hub preview service.
//
// It is not part of the app bundle - the platform launches it separately, from
// the path config.xml names - so Vite never sees it. It used to live in
// `public/` and be copied verbatim, which meant it was the one file in the repo
// no compiler checked and no `check:legacy` guarded: it shipped optional
// chaining to Tizen 6.0 (Chromium 76), where `?.` is a SyntaxError that kills
// the carousel silently.
//
// Now it is TypeScript, and this emits it: ES5, one self-contained CommonJS
// file, straight into dist/ AFTER the Vite builds (which would otherwise wipe
// it). Run from the shell directory: `bun scripts/build-service.ts`.

import { build } from 'esbuild';

const out = 'dist/service/preview-service.js';

await build({
  entryPoints: ['src/preview-service.cts'],
  outfile: out,
  bundle: true,
  platform: 'neutral',
  format: 'cjs',
  // The engine config.xml actually declares (required_version 6.0 = Chromium
  // 76), named as the browser rather than as an ES year so it stays true if the
  // floor moves. This is what lowers `?.` and `??`, which that engine cannot
  // parse and which reached it unlowered while the file was hand-written JS.
  target: 'chrome76',
  legalComments: 'none',
});

console.log(`[preview-service] → ${out}`);
