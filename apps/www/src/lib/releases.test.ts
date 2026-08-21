import { describe, expect, it } from 'vitest';
import { Feed, Release } from './release-feed.ts';
import {
  compareVersions,
  downloadsFor,
  megabytes,
  toSiteRelease,
  toSiteReleases,
} from './releases.ts';

const HEX = 'bbc124ee97eedce6f94b6e9baaacb56301f2e968466ca5c3ec74b78a376e9b35';

const asset = (name: string, size = 1024, extra: Record<string, unknown> = {}) => ({
  name,
  size,
  browser_download_url: `https://github.com/maxscharwath/kroma/releases/download/v0.1.38/${name}`,
  digest: `sha256:${HEX}`,
  created_at: '2026-08-14T00:17:26Z',
  ...extra,
});

const bare = (tag: string) => ({
  tag_name: tag,
  published_at: '2026-08-14T00:17:31Z',
  html_url: `https://github.com/maxscharwath/kroma/releases/tag/${tag}`,
  assets: [],
});

const raw = (fields: Record<string, unknown>) =>
  Release.parse({
    tag_name: 'v0.1.38',
    published_at: '2026-08-14T00:17:31Z',
    html_url: 'https://github.com/maxscharwath/kroma/releases/tag/v0.1.38',
    assets: [],
    ...fields,
  });

describe('toSiteRelease', () => {
  it('reduces a release to the version, the day and the files it offers', () => {
    const release = toSiteRelease(raw({ assets: [asset('KROMA_0.1.38_aarch64.dmg', 52807435)] }));

    expect(release).toEqual({
      version: '0.1.38',
      tag: 'v0.1.38',
      publishedAt: '2026-08-14T00:17:31Z',
      notesUrl: 'https://github.com/maxscharwath/kroma/releases/tag/v0.1.38',
      downloads: [
        {
          target: 'macos',
          name: 'KROMA_0.1.38_aarch64.dmg',
          url: 'https://github.com/maxscharwath/kroma/releases/download/v0.1.38/KROMA_0.1.38_aarch64.dmg',
          bytes: 52807435,
          sha256: HEX,
          builtAt: '2026-08-14T00:17:26Z',
        },
      ],
    });
  });

  it('drops the checksums and sidecars a release carries beside its installers', () => {
    const release = toSiteRelease(
      raw({
        assets: [
          asset('kroma-0.1.38.3480473-x86_64.spk'),
          asset('kroma-0.1.38.3480473-x86_64.spk.info.json'),
          asset('tv.kroma.scene.kmod'),
          asset('tv.kroma.scene.kmod.sha256'),
          asset('modules.json'),
        ],
      }),
    );

    expect(release?.downloads.map((d) => d.target)).toEqual(['synology']);
  });

  it('offers the build carrying its own version when a stray one sits beside it', () => {
    const release = toSiteRelease(
      raw({ assets: [asset('KROMA_0.1.39_aarch64.dmg'), asset('KROMA_0.1.38_aarch64.dmg')] }),
    );

    expect(release?.downloads).toHaveLength(1);
    expect(release?.downloads[0]?.name).toBe('KROMA_0.1.38_aarch64.dmg');
  });

  it('still offers a platform whose only build is named off-version', () => {
    const release = toSiteRelease(raw({ assets: [asset('KROMA_0.1.39_aarch64.dmg')] }));

    expect(release?.downloads[0]?.name).toBe('KROMA_0.1.39_aarch64.dmg');
  });

  it('refuses a rolling channel, whose builds are not a release of the product', () => {
    expect(toSiteRelease(raw({ tag_name: 'nightly', prerelease: true }))).toBeNull();
    expect(toSiteRelease(raw({ tag_name: 'desktop-latest', prerelease: true }))).toBeNull();
    expect(toSiteRelease(raw({ tag_name: 'tv.kroma.whisper@0.3.0', prerelease: true }))).toBeNull();
  });

  it('refuses a draft, whose assets are not public yet', () => {
    expect(toSiteRelease(raw({ draft: true }))).toBeNull();
  });

  it('answers a null day rather than a wrong one when the stamp is unusable', () => {
    expect(toSiteRelease(raw({ published_at: null }))?.publishedAt).toBeNull();
    expect(toSiteRelease(raw({ published_at: 'soon' }))?.publishedAt).toBeNull();
  });
});

describe('toSiteRelease checksums', () => {
  const only = (extra: Record<string, unknown>) =>
    toSiteRelease(raw({ assets: [asset('KROMA_0.1.38_aarch64.dmg', 1024, extra)] }))?.downloads[0];

  it('publishes the digest GitHub hashed the upload with', () => {
    expect(only({})?.sha256).toBe(HEX);
  });

  it('lowercases a digest so it matches what shasum prints', () => {
    expect(only({ digest: `sha256:${HEX.toUpperCase()}` })?.sha256).toBe(HEX);
  });

  it('refuses a digest it cannot vouch for rather than showing a broken one', () => {
    expect(only({ digest: null })?.sha256).toBeNull();
    expect(only({ digest: 'sha512:beef' })?.sha256).toBeNull();
    expect(only({ digest: 'sha256:beef' })?.sha256).toBeNull();
    expect(only({ digest: `sha256:${'z'.repeat(64)}` })?.sha256).toBeNull();
  });

  it('dates the build by the upload, not by the tag', () => {
    const release = toSiteRelease(
      raw({
        published_at: '2026-07-01T00:00:00Z',
        assets: [asset('KROMA_0.1.38_aarch64.dmg', 1024, { created_at: '2026-08-20T09:00:00Z' })],
      }),
    );

    expect(release?.publishedAt).toBe('2026-07-01T00:00:00Z');
    expect(release?.downloads[0]?.builtAt).toBe('2026-08-20T09:00:00Z');
  });
});

describe('downloadsFor', () => {
  const release = toSiteRelease(
    raw({
      assets: [
        asset('KROMA_0.1.38_x64_en-US.msi'),
        asset('KROMA_0.1.38_x64-setup.exe'),
        asset('KROMA_0.1.38_aarch64.dmg'),
      ],
    }),
  );

  it('answers in the order the caller names the platforms, not the release order', () => {
    const picked = downloadsFor(release, ['windows-exe', 'windows-msi']);

    expect(picked.map((d) => d.target)).toEqual(['windows-exe', 'windows-msi']);
  });

  it('skips a platform this release has no file for', () => {
    expect(downloadsFor(release, ['tizen', 'macos']).map((d) => d.target)).toEqual(['macos']);
  });

  it('answers nothing when no release was baked in', () => {
    expect(downloadsFor(null, ['macos'])).toEqual([]);
  });
});

describe('megabytes', () => {
  it('reads a .dmg in the unit a store shows a download in', () => {
    expect(megabytes(52807435)).toBe('50.4 MB');
  });
});

describe('compareVersions', () => {
  it('orders by number, which a string comparison gets backwards', () => {
    expect(compareVersions('0.1.38', '0.1.9')).toBeGreaterThan(0);
    expect(compareVersions('0.1.9', '0.1.38')).toBeLessThan(0);
    expect(compareVersions('0.2.0', '0.1.99')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });
});

describe('toSiteReleases', () => {
  const feed = Feed.parse([
    { ...bare('v0.1.9'), assets: [asset('KROMA_0.1.9_aarch64.dmg')] },
    { ...bare('v0.1.38'), assets: [asset('KROMA_0.1.38_aarch64.dmg')] },
    { ...bare('v0.1.10'), assets: [asset('KROMA_0.1.10_aarch64.dmg')] },
    { ...bare('nightly'), prerelease: true },
    { ...bare('tv.kroma.whisper@0.3.0'), prerelease: true },
    { ...bare('v0.1.40'), draft: true },
  ]);

  it('lists the newest version first, counting numerically', () => {
    expect(toSiteReleases(feed).map((r) => r.version)).toEqual(['0.1.38', '0.1.10', '0.1.9']);
  });

  it('leaves out every tag that is not a release of the product', () => {
    expect(toSiteReleases(feed).map((r) => r.tag)).not.toContain('nightly');
    expect(toSiteReleases(feed)).toHaveLength(3);
  });

  it('survives a release GitHub answers with a shape this site cannot read', () => {
    const mixed = Feed.parse([{ tag_name: 'v0.1.5', html_url: 'not-a-url' }, bare('v0.1.6')]);

    expect(toSiteReleases(mixed).map((r) => r.version)).toEqual(['0.1.6']);
  });
});
