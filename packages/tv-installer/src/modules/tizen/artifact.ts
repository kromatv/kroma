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

export const TIZEN_SHELL = 'clients/tizen';
const BUILD_TIMEOUT_MS = 900_000;

export const TIZEN_PACKAGE: PackageKind = {
  extension: '.wgt',
  globs: [`${TIZEN_SHELL}/out/*.wgt`, `${TIZEN_SHELL}/dist/*.wgt`],
  pattern: 'KROMA-tizen-*.wgt',
  runArtifact: 'kroma-tizen-wgt',
  // The every-tier build, not one of the KROMA-tizen8- / tizen4to7- slices.
  preferred: /KROMA-tizen-\d/,
};

export function tizenSources(): Source[] {
  return availableSources(TIZEN_PACKAGE, buildable(TIZEN_SHELL));
}

export function resolveTizenArtifact(request: ArtifactRequest): Promise<string> {
  return resolveArtifact({ id: 'tizen', kind: TIZEN_PACKAGE, build: buildTizen }, request);
}

async function buildTizen(log: LogLine): Promise<string> {
  log('building the Tizen bundle');
  await runOk(['bun', 'run', 'build:tizen'], { log, cwd: root, timeoutMs: BUILD_TIMEOUT_MS });
  // Left unsigned on purpose: installTizen signs with this machine's profile,
  // which is the only signature a retail set accepts.
  return join(root, `${TIZEN_SHELL}/dist`);
}
