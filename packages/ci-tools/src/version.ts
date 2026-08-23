import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { setOutput } from './actions';
import { root } from './root';

type Channel = 'stable' | 'candidate' | 'none';

interface Resolved {
  /** What every artifact is stamped with: `0.1.39`, or `0.1.39-rc1` from a dispatch. */
  version: string;
  /** The `X.Y.Z` the TV manifests and Apple take: `0.1.39-rc1` is `0.1.39`. */
  triplet: string;
  channel: Channel;
  /** Minutes since 2020, the monotonic build number the stores compare. */
  build: number;
  /** The name a canary file carries: `0.1.39-canary.3488516`. */
  canary: string;
}

export interface Context {
  event: string;
  refType: string | undefined;
  refName: string | undefined;
  input: string | undefined;
  manifestVersion: string;
  now: Date;
}

const EPOCH_2020 = Date.UTC(2020, 0, 1);

/** The build number a moment maps to; strictly increasing, one per minute. */
export const buildNumber = (now: Date) => Math.floor((now.getTime() - EPOCH_2020) / 60_000);

/**
 * The one version a run stamps on everything it builds, and the channel it
 * is for. A tag push is a stable release of that tag; a push to main builds
 * the version main is already on as a candidate, which `deploy.yml` promotes
 * byte for byte; a dispatch builds whatever it was asked for and publishes
 * nothing.
 */
export function resolveVersion(ctx: Context): Resolved {
  let version: string;
  let channel: Channel;
  if (ctx.event === 'push' && ctx.refType === 'tag') {
    if (!ctx.refName?.startsWith('v')) throw new Error(`tag '${ctx.refName}' is not vX.Y.Z`);
    version = ctx.refName.slice(1);
    channel = 'stable';
  } else if (ctx.event === 'push') {
    version = ctx.manifestVersion;
    channel = 'candidate';
  } else {
    version = ctx.input || ctx.manifestVersion;
    channel = 'none';
  }
  const triplet = version.split('-')[0] ?? version;
  const build = buildNumber(ctx.now);
  return { version, triplet, channel, build, canary: `${triplet}-canary.${build}` };
}

function manifestVersion(): string {
  const toml = readFileSync(join(root, 'server/Cargo.toml'), 'utf8');
  const version = /^version\s*=\s*"([^"]+)"/m.exec(toml)?.[1];
  if (!version) throw new Error('server/Cargo.toml carries no version');
  return version;
}

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: { input: { type: 'string', default: process.env.VERSION_INPUT ?? '' } },
  });
  const resolved = resolveVersion({
    event: process.env.GITHUB_EVENT_NAME ?? 'local',
    refType: process.env.GITHUB_REF_TYPE,
    refName: process.env.GITHUB_REF_NAME,
    input: values.input,
    manifestVersion: manifestVersion(),
    now: new Date(),
  });
  for (const [key, value] of Object.entries(resolved)) setOutput(key, value);
  console.log(
    `Version: ${resolved.version} (TV manifests: ${resolved.triplet}, channel: ${resolved.channel}, build: ${resolved.build})`,
  );
}
