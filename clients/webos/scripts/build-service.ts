// Emit the beacon JS Service: one self-contained CommonJS file plus the two
// manifests webOS reads, into `service/` beside the app's `dist/`.
//
// Separate from the Vite builds because the platform launches a service on its
// own, from its own directory - `ares-package` takes both. `webos-service` is
// left external: it binds to the TV's Luna bus and ships in the service's
// node_modules rather than in the bundle.

import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const OUT = 'service';
const ID = 'tv.kroma.webos.service';

await mkdir(OUT, { recursive: true });

await build({
  entryPoints: ['src/beacon-service.ts'],
  outfile: `${OUT}/index.js`,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // webOS TV's Node is old enough that the floor is worth stating rather than
  // inheriting from whatever built it.
  target: 'node14',
  external: ['webos-service'],
  legalComments: 'none',
});

await writeFile(
  `${OUT}/package.json`,
  `${JSON.stringify({ name: ID, main: 'index.js', version: '1.0.0' }, null, 2)}\n`,
);

await writeFile(
  `${OUT}/services.json`,
  `${JSON.stringify(
    {
      id: ID,
      description: 'Raises the KROMA television beacon on the local link.',
      services: [{ name: ID, description: 'DNS-SD beacon' }],
    },
    null,
    2,
  )}\n`,
);

console.log(`[beacon-service] → ${OUT}/index.js`);
