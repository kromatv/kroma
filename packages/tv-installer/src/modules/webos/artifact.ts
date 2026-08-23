import { join } from 'node:path';
import {
  type ArtifactRequest,
  availableSources,
  type PackageKind,
  resolveArtifact,
  type Source,
} from '../../install/artifact';
import { buildable } from '../../install/build';
import { root } from '../../root';
import { type LogLine, runOk } from '../../run';
import { requireTool } from '../../toolchain/detect';
import { ARES, aresSibling } from './tools';

export const WEBOS_SHELL = 'clients/webos';
const BUILD_TIMEOUT_MS = 900_000;

export const WEBOS_PACKAGE: PackageKind = {
  extension: '.ipk',
  globs: [`${WEBOS_SHELL}/out/*.ipk`, `${WEBOS_SHELL}/build/*.ipk`],
  pattern: 'tv.kroma.webos_*.ipk',
  runArtifact: 'kroma-webos-ipk',
};

export function webosSources(): Source[] {
  return availableSources(WEBOS_PACKAGE, buildable(WEBOS_SHELL));
}

export function resolveWebosArtifact(request: ArtifactRequest): Promise<string> {
  return resolveArtifact({ id: 'webos', kind: WEBOS_PACKAGE, build: buildWebos }, request);
}

async function buildWebos(log: LogLine): Promise<string> {
  log('building the webOS bundle');
  await runOk(['bun', 'run', 'build:webos'], { log, cwd: root, timeoutMs: BUILD_TIMEOUT_MS });

  const out = join(root, `${WEBOS_SHELL}/out`);
  const packager = aresSibling(requireTool(ARES), 'ares-package');
  await runOk([packager, join(root, `${WEBOS_SHELL}/dist`), '--no-minify', '-o', out], { log });

  const [built] = [...new Bun.Glob('*.ipk').scanSync({ cwd: out, absolute: true })];
  if (!built) throw new Error('ares-package produced no .ipk');
  return built;
}
