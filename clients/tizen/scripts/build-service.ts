// Emit the Smart Hub preview service: one self-contained CommonJS file, into
// dist/ after the Vite builds (which would otherwise wipe it). The platform
// launches it separately from the path config.xml names, so Vite never sees it.

import { lowerJs } from '@kroma/bundler/deep-tier';
import { build } from 'esbuild';

const CHROME = 47;
const out = 'dist/service/preview-service.js';

await build({
  entryPoints: ['src/preview-service.cts'],
  outfile: out,
  bundle: true,
  platform: 'neutral',
  format: 'cjs',
  target: 'es2015',
  legalComments: 'none',
});

// The engine config.xml declares: required_version 3.0 is Chromium 47. The
// platform launches this file on its own, so no tier of the app's build reaches
// it and this is the only thing lowering it; keep the two in step, or a set
// takes the widget and drops the carousel. esbuild stops at es2015 here for the
// same reason the deep tier needs Babel: it cannot lower block scoping at all.
await lowerJs(out, CHROME);

console.log(`[preview-service] → ${out} (chromium ${CHROME})`);
