import { join } from 'node:path';
import {
  anySource,
  type ArtifactRequest,
  availableSources,
  localArtifact,
  type PackageKind,
  resolveArtifact,
  type Source,
} from '../../install/artifact';
import { buildable, TV_NATIVE } from '../../install/build';
import { root } from '../../shared/root';
import { type LogLine, runOk } from '../../shared/run';
import type { Television } from '../../shared/television';
import { wantsWeb } from '../platform';

export const TIZEN_SHELL = 'clients/tizen';
const BUILD_TIMEOUT_MS = 900_000;
const NATIVE_BUILD_TIMEOUT_MS = 3_600_000;
const NATIVE_FLOOR = 6;

export const TIZEN_NATIVE_PACKAGE: PackageKind = {
  globs: [`${TV_NATIVE}/tizen/bin/Release/*/*.tpk`],
  pattern: 'KROMA-tizen-*.tpk',
  runArtifact: 'kroma-tizen-tpk',
};

export const TIZEN_WEB_PACKAGE: PackageKind = {
  globs: [`${TIZEN_SHELL}/out/*.wgt`, `${TIZEN_SHELL}/dist/*.wgt`],
  pattern: 'KROMA-tizen-*.wgt',
  runArtifact: 'kroma-tizen-wgt',
  // The every-tier build, not one of the KROMA-tizen8- / tizen4to7- slices.
  preferred: /KROMA-tizen-\d/,
};

export function tizenSources(): Source[] {
  return anySource(
    availableSources(TIZEN_NATIVE_PACKAGE, buildable(TV_NATIVE)),
    availableSources(TIZEN_WEB_PACKAGE, buildable(TIZEN_SHELL)),
  );
}

/**
 * The native app for every set that runs it, the web app for the others: a
 * Samsung before Tizen 6.0 refuses the native library a `.tpk` carries.
 */
export function resolveTizenArtifact(request: ArtifactRequest): Promise<string> {
  if (wantsWeb(request.options)) return resolveWeb(request);
  if (belowNativeFloor(request.tv)) {
    request.log(
      `Tizen ${request.tv.runtime?.version} is older than ${NATIVE_FLOOR}.0, the oldest the native app runs on: installing the web app`,
    );
    return resolveWeb(request);
  }
  if (request.source === 'local' && !localArtifact(TIZEN_NATIVE_PACKAGE))
    return resolveWeb(request);
  return resolveArtifact(
    { id: 'tizen', kind: TIZEN_NATIVE_PACKAGE, build: buildTizenNative },
    request,
  );
}

function resolveWeb(request: ArtifactRequest): Promise<string> {
  return resolveArtifact({ id: 'tizen-web', kind: TIZEN_WEB_PACKAGE, build: buildTizen }, request);
}

function belowNativeFloor(tv: Television): boolean {
  const version = Number.parseFloat(tv.runtime?.version ?? '');
  return Number.isFinite(version) && version < NATIVE_FLOOR;
}

async function buildTizenNative(log: LogLine): Promise<string> {
  log('building the native Samsung app');
  await runOk(['bunx', 'rn-tv', 'tizen', 'package'], {
    log,
    cwd: join(root, TV_NATIVE),
    timeoutMs: NATIVE_BUILD_TIMEOUT_MS,
  });
  const built = localArtifact(TIZEN_NATIVE_PACKAGE);
  if (!built) throw new Error('rn-tv tizen package produced no .tpk');
  return built;
}

async function buildTizen(log: LogLine): Promise<string> {
  log('building the Tizen bundle');
  await runOk(['bun', 'run', 'build:tizen'], { log, cwd: root, timeoutMs: BUILD_TIMEOUT_MS });
  // Left unsigned on purpose: installTizen signs with this machine's profile,
  // which is the only signature a retail set accepts.
  return join(root, `${TIZEN_SHELL}/dist`);
}
