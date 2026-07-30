#!/usr/bin/env bun
// Generate a Synology "package source" repository (catalog.json + icon + landing page) for
// static hosting. Env-driven; see `.env.example`.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { channelSubs, renderLanding, type Subs } from './render-landing';
import { extractIcon, readSpkInfo } from './spk';

function env(key: string, fallback?: string): string {
  const v = process.env[key]?.trim();
  if (v) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env var ${key} (see packages/synology-repo/.env.example)`);
}

// Linear pass on purpose: a `/\/+$/` regex backtracks the run at every position.
function stripTrailingSlash(s: string): string {
  let end = s.length;
  while (end > 0 && s[end - 1] === '/') end--;
  return s.slice(0, end);
}

function findSpk(dirs: string[]): string {
  const found: { path: string; mtime: number }[] = [];
  for (const dir of dirs) {
    const abs = resolve(dir);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs)) {
      if (f.endsWith('.spk'))
        found.push({ path: join(abs, f), mtime: statSync(join(abs, f)).mtimeMs });
    }
  }
  found.sort((a, b) => b.mtime - a.mtime);
  const newest = found[0];
  if (!newest) throw new Error(`No .spk in ${dirs.join(', ')}; set CATALOG_SPK`);
  return newest.path;
}

const spk = process.env.CATALOG_SPK?.trim() || findSpk(['.', 'dist', 'clients/synology/dist']);
const downloadUrl = env('CATALOG_DOWNLOAD_URL');
const pagesUrl = stripTrailingSlash(env('CATALOG_PAGES_URL'));
const outDir = resolve(env('CATALOG_OUT_DIR', 'dist/repo'));
const catalogName = env('CATALOG_NAME', 'catalog.json'); // e.g. nightly.json for a beta channel
const beta = env('CATALOG_BETA', 'false') === 'true';
const meta = {
  maintainer: env('CATALOG_MAINTAINER', 'KROMA'),
  maintainerUrl: env('CATALOG_MAINTAINER_URL', 'https://github.com/maxscharwath/kroma'),
  distributor: env('CATALOG_DISTRIBUTOR', env('CATALOG_MAINTAINER', 'KROMA')),
  distributorUrl: env('CATALOG_DISTRIBUTOR_URL', 'https://github.com/maxscharwath/kroma'),
  changelogUrl: env('CATALOG_CHANGELOG_URL', 'https://github.com/maxscharwath/kroma/releases'),
};

const {
  package: pkg,
  version: rawVersion,
  dname,
  desc,
  arch,
  firmware,
  size,
  md5,
} = readSpkInfo(spk);

// DSM's package-center list hides a package whose feature version has a large 4th
// segment, which is how build.sh stamps nightlies (`X.Y.Z.BUILD-BUILD`), so
// collapse to `major.minor.micro-build`. Mirrors worker/catalog.ts dsmVersion().
const [feat = '', build] = rawVersion.split('-');
const version = build ? `${feat.split('.').slice(0, 3).join('.')}-${build}` : feat;

const iconOverride = process.env.CATALOG_ICON?.trim();
const iconBytes = iconOverride ? readFileSync(iconOverride) : extractIcon(spk);

const iconFile = `${pkg}.png`;
const iconUrl = `${pagesUrl}/${iconFile}`;
const catalog = {
  packages: [
    {
      package: pkg,
      version,
      dname,
      desc,
      download_count: 0,
      recent_download_count: 0,
      link: downloadUrl,
      size,
      md5,
      thumbnail: [iconUrl],
      thumbnail_retina: [iconUrl],
      snapshot: [],
      maintainer: meta.maintainer,
      maintainer_url: meta.maintainerUrl,
      distributor: meta.distributor,
      distributor_url: meta.distributorUrl,
      changelog: meta.changelogUrl,
      firmware,
      // No `model`/`beta` fields: DSM reads `model: []` as an empty supported-model
      // whitelist, and `beta: true` from a dynamic source, as reasons to hide the
      // row. The channel is gated by which .spk this catalog points at.
      qinst: true,
      qstart: true,
      qupgrade: true,
      deppkgs: null,
      conflictpkgs: null,
      startable: 'yes',
    },
  ],
};

const catalogUrl = `${pagesUrl}/${catalogName}`;
const subs: Subs = {
  DNAME: dname,
  ICON_FILE: iconFile,
  VERSION: version,
  ARCH: arch,
  DSM_FLOOR: firmware.split('-')[0] ?? firmware,
  CATALOG_URL: catalogUrl,
  DOWNLOAD_URL: downloadUrl,
  ...channelSubs(beta, dname),
};
const template = readFileSync(join(import.meta.dirname, 'landing.template.html'), 'utf8');
const landing = renderLanding(template, subs);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, catalogName), `${JSON.stringify(catalog, null, 2)}\n`);
writeFileSync(join(outDir, iconFile), iconBytes);
writeFileSync(join(outDir, 'index.html'), landing);

console.log(`Wrote ${dname} ${version}${beta ? ' (beta)' : ''} -> ${outDir}`);
console.log(`  spk:     ${spk}`);
console.log(`  link:    ${downloadUrl}`);
console.log(`  md5:     ${md5}`);
console.log(`  size:    ${size} bytes`);
console.log(`  catalog: ${catalogUrl}`);
