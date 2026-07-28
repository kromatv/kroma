/**
 * `gen-catalog.ts` is a top-level script: it reads env + a .spk and writes the
 * repository DSM points at. Nothing imported it, so it sat at 0% — and the
 * things it gets right are the kind DSM punishes silently, by hiding the row
 * rather than reporting an error.
 *
 * The fixtures are real .spk files (tar archives) built here with `tar`, the
 * same tool `extractFromSpk` shells out to, so nothing binary is checked in.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Build a .spk (a tar of INFO + icons) and return its path. `retina: false`
 * omits PACKAGE_ICON_256.PNG so the extractor has to fall back to the plain one
 * - `tar` writes to stderr on that path, which is why it is opt-in rather than
 * the default for every fixture here.
 */
function makeSpk(
  dir: string,
  name: string,
  info: Record<string, string>,
  { retina = true }: { retina?: boolean } = {},
): string {
  const staging = join(dir, `staging-${name}`);
  mkdirSync(staging, { recursive: true });
  writeFileSync(
    join(staging, 'INFO'),
    `${Object.entries(info)
      .map(([k, v]) => `${k}="${v}"`)
      .join('\n')}\n`,
  );
  // A four-byte PNG header is enough: the script only copies the bytes through.
  const members = ['INFO', 'PACKAGE_ICON.PNG'];
  writeFileSync(join(staging, 'PACKAGE_ICON.PNG'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (retina) {
    writeFileSync(join(staging, 'PACKAGE_ICON_256.PNG'), Buffer.from([0x89, 0x50, 0x4e, 0x48]));
    members.push('PACKAGE_ICON_256.PNG');
  }
  const spk = join(dir, name);
  execFileSync('tar', ['-cf', spk, '-C', staging, ...members]);
  return spk;
}

const BASE_INFO = {
  package: 'kroma',
  version: '1.2.3',
  displayname: 'KROMA',
  description: 'Your library, everywhere.',
  arch: 'x86_64',
  os_min_ver: '7.0-40000',
};

let work: string;
const savedEnv = { ...process.env };

/** Run the generator with `env` applied, and return the files it wrote. */
async function generate(env: Record<string, string | undefined>) {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('CATALOG_')) delete process.env[key];
  }
  Object.assign(process.env, env);
  // The script does its work at import time, so each run needs a fresh module
  // registry - a query-string cache-buster would bypass Vite's TS transform.
  vi.resetModules();
  await import('./gen-catalog');

  const outDir = env.CATALOG_OUT_DIR as string;
  const catalogName = env.CATALOG_NAME ?? 'catalog.json';
  return {
    catalog: JSON.parse(readFileSync(join(outDir, catalogName), 'utf8')),
    landing: readFileSync(join(outDir, 'index.html'), 'utf8'),
    outDir,
  };
}

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'kroma-syno-'));
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('CATALOG_')) delete process.env[key];
  }
  Object.assign(process.env, savedEnv);
});

describe('the catalog entry', () => {
  it('is built from the .spk itself, so it can never disagree with it', async () => {
    const spk = makeSpk(work, 'kroma.spk', BASE_INFO);
    const { catalog } = await generate({
      CATALOG_SPK: spk,
      CATALOG_DOWNLOAD_URL: 'https://github.test/releases/kroma.spk',
      CATALOG_PAGES_URL: 'https://pages.test/repo',
      CATALOG_OUT_DIR: join(work, 'out'),
    });

    const entry = catalog.packages[0];
    expect(entry.package).toBe('kroma');
    expect(entry.version).toBe('1.2.3');
    expect(entry.dname).toBe('KROMA');
    expect(entry.desc).toBe('Your library, everywhere.');
    expect(entry.firmware).toBe('7.0-40000');
    // DSM verifies these against the file it downloads.
    expect(entry.size).toBe(readFileSync(spk).byteLength);
    expect(entry.md5).toMatch(/^[0-9a-f]{32}$/);
    expect(entry.link).toBe('https://github.test/releases/kroma.spk');
  });

  it('omits the two fields that make DSM hide the row', async () => {
    // `model: []` reads as an empty supported-model whitelist and `beta: true`
    // from a dynamic source both make DSM silently drop the package from
    // Package Center. Neither produces an error anywhere.
    const { catalog } = await generate({
      CATALOG_SPK: makeSpk(work, 'kroma.spk', BASE_INFO),
      CATALOG_DOWNLOAD_URL: 'https://github.test/kroma.spk',
      CATALOG_PAGES_URL: 'https://pages.test/repo',
      CATALOG_OUT_DIR: join(work, 'out'),
      CATALOG_BETA: 'true',
    });

    const entry = catalog.packages[0];
    expect(entry).not.toHaveProperty('model');
    expect(entry).not.toHaveProperty('beta');
  });

  it('collapses a nightly version to what DSM will actually render', async () => {
    // build.sh stamps nightlies `X.Y.Z.BUILD-BUILD`. DSM hides a package whose
    // feature version has a 4th segment that large, so it collapses to the
    // conventional major.minor.micro-build.
    const { catalog } = await generate({
      CATALOG_SPK: makeSpk(work, 'nightly.spk', { ...BASE_INFO, version: '1.2.3.4567-4567' }),
      CATALOG_DOWNLOAD_URL: 'https://github.test/kroma.spk',
      CATALOG_PAGES_URL: 'https://pages.test/repo',
      CATALOG_OUT_DIR: join(work, 'out'),
    });
    expect(catalog.packages[0].version).toBe('1.2.3-4567');
  });

  it('leaves a stable three-segment version untouched', async () => {
    const { catalog } = await generate({
      CATALOG_SPK: makeSpk(work, 'stable.spk', { ...BASE_INFO, version: '2.0.1' }),
      CATALOG_DOWNLOAD_URL: 'https://github.test/kroma.spk',
      CATALOG_PAGES_URL: 'https://pages.test/repo',
      CATALOG_OUT_DIR: join(work, 'out'),
    });
    expect(catalog.packages[0].version).toBe('2.0.1');
  });
});

describe('the published files', () => {
  it('writes the catalog, the icon and a landing page', async () => {
    const { outDir, landing } = await generate({
      CATALOG_SPK: makeSpk(work, 'kroma.spk', BASE_INFO),
      CATALOG_DOWNLOAD_URL: 'https://github.test/kroma.spk',
      CATALOG_PAGES_URL: 'https://pages.test/repo',
      CATALOG_OUT_DIR: join(work, 'out'),
    });

    expect(existsSync(join(outDir, 'catalog.json'))).toBe(true);
    expect(existsSync(join(outDir, 'index.html'))).toBe(true);
    // The icon is named after the package, and the catalog points at that name.
    // The 256px one wins when the .spk carries both.
    expect(readFileSync(join(outDir, 'kroma.png'))).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x48]));
    expect(landing).toContain('KROMA');
    // No placeholder may survive into the published page.
    expect(landing).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it('points the thumbnails at the pages URL without a doubled slash', async () => {
    // The env var is written by hand in CI; a trailing slash there would
    // produce `https://pages.test/repo//kroma.png`, which some CDNs 404.
    const { catalog } = await generate({
      CATALOG_SPK: makeSpk(work, 'kroma.spk', BASE_INFO),
      CATALOG_DOWNLOAD_URL: 'https://github.test/kroma.spk',
      CATALOG_PAGES_URL: 'https://pages.test/repo///',
      CATALOG_OUT_DIR: join(work, 'out'),
    });
    expect(catalog.packages[0].thumbnail).toEqual(['https://pages.test/repo/kroma.png']);
    expect(catalog.packages[0].thumbnail_retina).toEqual(['https://pages.test/repo/kroma.png']);
  });

  it('names the catalog file so a beta channel can sit beside the stable one', async () => {
    const { outDir } = await generate({
      CATALOG_SPK: makeSpk(work, 'kroma.spk', BASE_INFO),
      CATALOG_DOWNLOAD_URL: 'https://github.test/kroma.spk',
      CATALOG_PAGES_URL: 'https://pages.test/repo',
      CATALOG_OUT_DIR: join(work, 'out'),
      CATALOG_NAME: 'nightly.json',
      CATALOG_BETA: 'true',
    });
    expect(existsSync(join(outDir, 'nightly.json'))).toBe(true);
    expect(existsSync(join(outDir, 'catalog.json'))).toBe(false);
  });

  it('falls back to the plain icon when the .spk has no 256px one', async () => {
    // Older builds only shipped PACKAGE_ICON.PNG; a missing retina icon must
    // not fail the whole publish.
    const { outDir } = await generate({
      CATALOG_SPK: makeSpk(work, 'old.spk', BASE_INFO, { retina: false }),
      CATALOG_DOWNLOAD_URL: 'https://github.test/kroma.spk',
      CATALOG_PAGES_URL: 'https://pages.test/repo',
      CATALOG_OUT_DIR: join(work, 'out'),
    });
    expect(readFileSync(join(outDir, 'kroma.png'))).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('uses an explicitly supplied icon over the one inside the .spk', async () => {
    const override = join(work, 'brand.png');
    writeFileSync(override, Buffer.from([1, 2, 3, 4, 5]));
    const { outDir } = await generate({
      CATALOG_SPK: makeSpk(work, 'kroma.spk', BASE_INFO),
      CATALOG_DOWNLOAD_URL: 'https://github.test/kroma.spk',
      CATALOG_PAGES_URL: 'https://pages.test/repo',
      CATALOG_OUT_DIR: join(work, 'out'),
      CATALOG_ICON: override,
    });
    expect(readFileSync(join(outDir, 'kroma.png'))).toEqual(Buffer.from([1, 2, 3, 4, 5]));
  });
});

describe('configuration', () => {
  it('refuses to run without the URLs it cannot invent', async () => {
    // A catalog with a missing download link installs nothing; failing loudly
    // in CI beats publishing a broken repository.
    await expect(
      generate({
        CATALOG_SPK: makeSpk(work, 'kroma.spk', BASE_INFO),
        CATALOG_PAGES_URL: 'https://pages.test/repo',
        CATALOG_OUT_DIR: join(work, 'out'),
      }),
    ).rejects.toThrow(/CATALOG_DOWNLOAD_URL/);
  });

  it('carries the maintainer details through, with defaults', async () => {
    const { catalog } = await generate({
      CATALOG_SPK: makeSpk(work, 'kroma.spk', BASE_INFO),
      CATALOG_DOWNLOAD_URL: 'https://github.test/kroma.spk',
      CATALOG_PAGES_URL: 'https://pages.test/repo',
      CATALOG_OUT_DIR: join(work, 'out'),
      CATALOG_MAINTAINER: 'Someone',
    });
    const entry = catalog.packages[0];
    expect(entry.maintainer).toBe('Someone');
    // The distributor defaults to the maintainer rather than to the built-in.
    expect(entry.distributor).toBe('Someone');
    expect(entry.changelog).toMatch(/^https:\/\//);
  });
});
