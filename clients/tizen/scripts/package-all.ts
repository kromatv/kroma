// Every installable package of one build, signed and named, into `out/`:
//
//   KROMA-tizen-<version>.wgt       every tier, the gate chooses (the Store package)
//   KROMA-tizen8-<version>.wgt      Tizen 8.0 and newer (2024+)
//   KROMA-tizen4to7-<version>.wgt   Tizen 4.0 to 7.0 (2018 to 2023)
//   KROMA-tizen3-<version>.wgt      Tizen 3.0 (2017)
//
//   TIZEN_PROFILE=kroma-ci bun scripts/package-all.ts
//
// The version is the one `dist/config.xml` carries (stamped before packaging),
// the signing profile is TIZEN_PROFILE, or the active one when unset. Needs
// `tizen` (Tizen Studio CLI) on the PATH.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIER_NAMES, TIERS } from './tiers';

const SHELL = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(SHELL, 'dist');
const OUT = join(SHELL, 'out');

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('[package] no build at dist/. Run `bun run build:tizen` first.');
  process.exit(1);
}

const version = /<widget[^>]*\sversion="(\d+\.\d+\.\d+)"/.exec(
  readFileSync(join(DIST, 'config.xml'), 'utf8'),
)?.[1];
if (!version) {
  console.error('[package] dist/config.xml carries no x.y.z version');
  process.exit(1);
}

const profile = process.env.TIZEN_PROFILE;
const signing = profile ? ['-s', profile] : [];

function pack(dir: string, name: string): void {
  execFileSync('tizen', ['package', '-t', 'wgt', ...signing, '--', dir], {
    cwd: SHELL,
    stdio: 'inherit',
  });
  const wgt = readdirSync(dir).find((f) => f.endsWith('.wgt'));
  if (!wgt) throw new Error(`tizen package left no .wgt in ${dir}`);
  renameSync(join(dir, wgt), join(OUT, name));
  console.log(`[package] ${name}`);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

pack(DIST, `KROMA-tizen-${version}.wgt`);
for (const tier of TIER_NAMES) {
  execFileSync('bun', ['scripts/slice.ts', tier], { cwd: SHELL, stdio: 'inherit' });
  pack(join(SHELL, `dist-${tier}`), `KROMA-${TIERS[tier].name}-${version}.wgt`);
}
