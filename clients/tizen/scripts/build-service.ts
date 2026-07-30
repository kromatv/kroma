// Emit the Smart Hub preview service: one self-contained CommonJS file, into
// dist/ after the Vite builds (which would otherwise wipe it). The platform
// launches it separately from the path config.xml names, so Vite never sees it.

import { build } from 'esbuild';

const out = 'dist/service/preview-service.js';

await build({
  entryPoints: ['src/preview-service.cts'],
  outfile: out,
  bundle: true,
  platform: 'neutral',
  format: 'cjs',
  // The engine config.xml declares (required_version 6.0 = Chromium 76). This is
  // what lowers `?.` and `??`, which that engine cannot parse.
  target: 'chrome76',
  legalComments: 'none',
});

console.log(`[preview-service] → ${out}`);
