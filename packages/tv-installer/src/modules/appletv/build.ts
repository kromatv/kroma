import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { root } from '../../root';
import { type LogLine, runOk } from '../../run';
import { APPLETV_TOOLS, missingAppleTvTools } from './toolchain';

const BUILD_TIMEOUT_MS = 3_600_000;
const SHELL = 'clients/tv-native';
const BUILT_APPS = `${SHELL}/ios/build/**/Products/*-appletvos/*.app`;

export type AppleTvSource = 'local' | 'build';

export interface AppleTvAppRequest {
  udid: string;
  log: LogLine;
  given?: string;
  source?: AppleTvSource;
}

/** The newest `.app` built for a real set. */
export function localAppleTvApp(): string | null {
  const built = [
    ...new Bun.Glob(BUILT_APPS).scanSync({ cwd: root, absolute: true, onlyFiles: false }),
  ]
    .map((path) => ({ path, mtimeMs: statSync(path).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return built[0]?.path ?? null;
}

export function buildableAppleTv(): boolean {
  return existsSync(join(root, SHELL, 'package.json'));
}

export function appleTvSources(): AppleTvSource[] {
  const sources: AppleTvSource[] = [];
  if (localAppleTvApp()) sources.push('local');
  if (buildableAppleTv()) sources.push('build');
  return sources;
}

export async function resolveAppleTvApp({
  given,
  source,
  udid,
  log,
}: AppleTvAppRequest): Promise<string> {
  if (given) return given;

  const local = source === 'build' ? null : localAppleTvApp();
  if (local) {
    const relative = local.replace(`${root}/`, '');
    log(`app: ${relative}`);
    return local;
  }
  return buildAppleTvApp(udid, log);
}

export async function buildAppleTvApp(udid: string, log: LogLine): Promise<string> {
  const missing = missingAppleTvTools('build');
  if (missing.length > 0) {
    const wanted = missing.map(
      (tool) => `${APPLETV_TOOLS[tool].label} (${APPLETV_TOOLS[tool].source})`,
    );
    throw new Error(`a build from source still needs ${wanted.join(', ')}`);
  }

  log('building the tvOS app with Xcode, which takes tens of minutes on a cold checkout');
  log('Xcode signs it as it builds, so this set must already be in one of your profiles');
  await runOk(['bun', 'run', '--filter', '@kroma/tv-native', 'ios', '--device', udid], {
    log,
    cwd: root,
    timeoutMs: BUILD_TIMEOUT_MS,
  });

  const built = localAppleTvApp();
  if (!built) throw new Error(`the build left no appletvos .app under ${SHELL}/ios/build`);
  return built;
}
