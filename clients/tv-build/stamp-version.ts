// Post-build step: stamp the PRODUCT version into a TV shell's store manifest.
//
// Both stores key an update off the version in the package manifest - Samsung
// rejects a `.wgt` whose `<widget version>` did not increase, LG the same for
// `appinfo.json` - and both print it on the store listing. Kept by hand, those
// files drift from the version the app actually reports: `__KROMA_VERSION__`
// comes from `productVersion()` (server/Cargo.toml, or CI's KROMA_VERSION), so a
// checked-in manifest is a second source of truth that goes stale the moment the
// product version moves. Stamping the built copy removes that second source.
//
// The checked-in values still matter - they are what a manual `ares-package` or
// `tizen package` over `public/` would read - so keep them current too; this is
// what guarantees a SHIPPED package matches.
//
// Run from the SHELL directory (cwd), AFTER vite: `bun ../tv-build/stamp-version.ts`.
// Deliberately not a Vite plugin: Vite copies `publicDir` into `dist/` without
// awaiting it, so even a `closeBundle` hook can read the manifest half-written
// (or 0 bytes) and fail to find the version it is meant to replace. A separate
// process after `vite build` has exited cannot race the copy.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { productVersion } from '../build-info/index.js';

/** Store manifests take a strict numeric triple: Tizen `[0-255].[0-255].[0-65535]`,
 * webOS the same shape. A product version carrying a pre-release tail ("1.2.0-rc1",
 * which CI's KROMA_VERSION may well be) is not a legal package version, so take
 * the leading triple and drop the tail rather than emitting something the store's
 * pre-test rejects. */
export function packageVersion(version: string): string | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!m) return null;
  const [, major, minor, patch] = m;
  if (Number(major) > 255 || Number(minor) > 255 || Number(patch) > 65535) return null;
  return `${major}.${minor}.${patch}`;
}

/** Set `"version"` in a webOS appinfo.json. Parsed and re-serialised rather than
 * regex-replaced: `version` is not the only key that could match one. */
export function stampAppinfo(source: string, version: string): string {
  const info = JSON.parse(source) as Record<string, unknown>;
  info.version = version;
  return `${JSON.stringify(info, null, 2)}\n`;
}

/** Set the `version` attribute on a Tizen config.xml's root `<widget>`. Scoped to
 * that one tag so the `version="1.0"` in the XML declaration is left alone.
 *
 * The tag is matched BEFORE replacing rather than inferred from "did the string
 * change": stamping a manifest that already carries the target version is a
 * no-op, and a no-op is not a failure. */
export function stampConfigXml(source: string, version: string): string {
  const widget = /(<widget\b[^>]*?\sversion=")[^"]*(")/;
  if (!widget.test(source)) throw new Error('no <widget version="..."> to stamp');
  return source.replace(widget, (_full, head: string, tail: string) => `${head}${version}${tail}`);
}

const MANIFEST: Record<string, { file: string; stamp: (src: string, v: string) => string }> = {
  'appinfo.json': { file: 'appinfo.json', stamp: stampAppinfo },
  'config.xml': { file: 'config.xml', stamp: stampConfigXml },
};

if (import.meta.main) {
  const shell = process.cwd();
  const repoRoot = join(shell, '..', '..');
  const raw = productVersion(repoRoot) ?? 'dev';
  const version = packageVersion(raw);

  // 'dev' (no Cargo.toml, no KROMA_VERSION) is the normal case for a contributor
  // building outside the repo layout: leave the checked-in version alone rather
  // than failing their build.
  if (!version) {
    if (raw !== 'dev') {
      console.error(`[stamp-version] "${raw}" is not a legal package version - not stamped`);
      process.exit(1);
    }
    console.log('[stamp-version] no product version - leaving the manifest as checked in');
    process.exit(0);
  }

  // Which manifest this shell ships is simply which one is in its dist/.
  const found = Object.values(MANIFEST).find((m) => {
    try {
      readFileSync(join(shell, 'dist', m.file), 'utf8');
      return true;
    } catch {
      return false;
    }
  });
  if (!found) {
    console.error('[stamp-version] no appinfo.json or config.xml in dist/ - did vite build run?');
    process.exit(1);
  }

  const path = join(shell, 'dist', found.file);
  writeFileSync(path, found.stamp(readFileSync(path, 'utf8'), version));
  console.log(`[stamp-version] ${found.file} → ${version}`);
}
