#!/usr/bin/env bun
// Bundle an Expo client for both native platforms and fail if either breaks.
//
// Shared by the native TV app and the mobile app, because they need the same
// gate for the same reason: both render the shared @kroma/ui design system,
// both are EDITED almost entirely while looking at a browser shell, and nothing
// else in the pipeline would notice a DOM element or a browser-only API sneaking
// back in. Metro would, at the worst possible moment.
//
// It bundles, it does not build an app: no Xcode, no Gradle, no signing. That
// keeps it fast enough to run on every push while still proving the one thing
// that actually regresses.
//
//   bun clients/expo-build/bundle-check.ts <project-dir> [ENV_KEY=value ...]

import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const [dir, ...envArgs] = process.argv.slice(2);
if (!dir) {
  console.error('usage: bundle-check.ts <project-dir> [KEY=value ...]');
  process.exit(2);
}
const root = resolve(process.cwd(), dir);

/**
 * The size this client is not allowed to exceed, in MB (`--max 10`).
 *
 * A RATCHET, not a target: it is set just above whatever the bundle weighs
 * today, so the number can only ever be lowered. Bloat on a television does not
 * arrive as one bad commit, it arrives as fifty reasonable ones, and the gate
 * exists to make the fifty-first argue for itself. Without a ceiling the size
 * was printed on every run and read by nobody - the TV bundle reached 9.4 MB of
 * bytecode that way, 69% of it icons nothing asked for.
 *
 * Lower it whenever a change wins room back. See atlas-report.ts for where the
 * weight actually is.
 */
const maxAt = envArgs.indexOf('--max');
const MAX_MB = maxAt === -1 ? Number.POSITIVE_INFINITY : Number(envArgs[maxAt + 1]);
const extraEnv = Object.fromEntries(
  envArgs
    // `--max` and its value are a flag, not environment. Guarded on `maxAt`
    // being found: with no flag it is -1, and `maxAt + 1` would then drop
    // argument 0 - which is `EXPO_TV=1`, and losing it builds the TV client as
    // a phone without saying so.
    .filter((_, index) => maxAt === -1 || (index !== maxAt && index !== maxAt + 1))
    .map((pair) => {
      const at = pair.indexOf('=');
      return [pair.slice(0, at), pair.slice(at + 1)];
    }),
);

const platforms = ['ios', 'android'] as const;

/** Expo prints `(9.4 MB)`, and a gate needs a number. Returns NaN for a size it
 * did not recognise, which compares false against the budget - an unreadable
 * size must not fail the build, it is the bundle that is being tested here. */
function bytesOf(size: string): number {
  const match = /^([\d.]+)\s*([kMG]?B)$/.exec(size.trim());
  if (!match) return Number.NaN;
  const scale = { B: 1, kB: 1e3, MB: 1e6, GB: 1e9 }[match[2] as string] ?? Number.NaN;
  return Number(match[1]) * scale;
}

/** Bundle one platform. Neither depends on the other's result, so the two runs
 * are started together: a Metro export of this workspace is minutes, and this
 * gate runs for two clients on every push. */
async function bundle(platform: (typeof platforms)[number]): Promise<string | null> {
  const out = mkdtempSync(join(tmpdir(), `kroma-bundle-${platform}-`));
  try {
    // `node`, not bun: the Expo CLI shells out to Metro, which expects Node.
    const { stdout, stderr } = await run(
      'node',
      ['node_modules/.bin/expo', 'export', '--platform', platform, '--output-dir', out],
      { cwd: root, env: { ...process.env, ...extraEnv }, maxBuffer: 64 * 1024 * 1024 },
    );
    const size =
      /[a-z]{1,32}-[a-f0-9]{1,64}\.hbc \(([^)]{1,32})\)/.exec(`${stdout}${stderr}`)?.[1] ??
      'unknown size';
    const bytes = bytesOf(size);
    if (bytes > MAX_MB * 1e6) {
      console.log(`bundling ${platform}... ok (${size}) OVER BUDGET`);
      return `${platform}: ${size} of bytecode exceeds the ${MAX_MB} MB budget.\nRun atlas-report.ts on the export to see which package grew.`;
    }
    console.log(`bundling ${platform}... ok (${size})`);
    return null;
  } catch (err) {
    const { stdout = '', stderr = '' } = err as { stdout?: string; stderr?: string };
    console.log(`bundling ${platform}... FAILED`);
    return `${stdout}${stderr}`.split('\n').slice(-25).join('\n');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

const failures = (await Promise.all(platforms.map(bundle))).filter((f) => f !== null);
if (failures.length > 0) {
  for (const output of failures) console.error(output);
  process.exit(1);
}
console.log('\nBoth native bundles build from the shared source.');
