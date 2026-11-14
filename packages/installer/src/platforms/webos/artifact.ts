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
import { matchingPaths } from '../../install/matching-paths';
import { root } from '../../shared/root';
import { type LogLine, runOk } from '../../shared/run';
import { wantsWeb } from '../platform';

export const WEBOS_SHELL = 'clients/webos';
const BUILD_TIMEOUT_MS = 900_000;
const NATIVE_BUILD_TIMEOUT_MS = 3_600_000;
const ARES_CLI = '@webos-tools/cli';

export const WEBOS_NATIVE_PACKAGE: PackageKind = {
  globs: [`${TV_NATIVE}/webos/*.ipk`],
  pattern: 'KROMA-webos-*.ipk',
  runArtifact: 'kroma-webos-native-ipk',
};

export const WEBOS_WEB_PACKAGE: PackageKind = {
  globs: [`${WEBOS_SHELL}/out/*.ipk`, `${WEBOS_SHELL}/build/*.ipk`],
  pattern: 'tv.kroma.webos_*.ipk',
  runArtifact: 'kroma-webos-ipk',
};

export function webosSources(): Source[] {
  return anySource(
    availableSources(WEBOS_NATIVE_PACKAGE, buildable(TV_NATIVE)),
    availableSources(WEBOS_WEB_PACKAGE, buildable(WEBOS_SHELL)),
  );
}

/** The native app, unless the install asked for the web one. */
export function resolveWebosArtifact(request: ArtifactRequest): Promise<string> {
  const web =
    wantsWeb(request.options) ||
    (request.source === 'local' && !localArtifact(WEBOS_NATIVE_PACKAGE));
  if (web) {
    return resolveArtifact(
      { id: 'webos-web', kind: WEBOS_WEB_PACKAGE, build: buildWebos },
      request,
    );
  }
  return resolveArtifact(
    { id: 'webos', kind: WEBOS_NATIVE_PACKAGE, build: buildWebosNative },
    request,
  );
}

async function buildWebosNative(log: LogLine): Promise<string> {
  log('building the native LG app');
  await runOk(['bunx', 'rn-tv', 'webos', 'package'], {
    log,
    cwd: join(root, TV_NATIVE),
    timeoutMs: NATIVE_BUILD_TIMEOUT_MS,
  });
  const built = localArtifact(WEBOS_NATIVE_PACKAGE);
  if (!built) throw new Error('rn-tv webos package produced no .ipk');
  return built;
}

async function buildWebos(log: LogLine): Promise<string> {
  log('building the webOS bundle');
  await runOk(['bun', 'run', 'build:webos'], { log, cwd: root, timeoutMs: BUILD_TIMEOUT_MS });

  const out = join(root, `${WEBOS_SHELL}/out`);
  const shell = join(root, `${WEBOS_SHELL}/dist`);
  await runOk(['bunx', '--package', ARES_CLI, 'ares-package', shell, '--no-minify', '-o', out], {
    log,
  });

  const [built] = matchingPaths(out, '*.ipk');
  if (!built) throw new Error('ares-package produced no .ipk');
  return built;
}
