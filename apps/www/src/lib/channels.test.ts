import { describe, expect, it } from 'vitest';
import { toCanaryBuilds, toChannelBuilds, versionOf } from './channels.ts';
import { Release } from './release-feed.ts';

const asset = (name: string, createdAt: string, size = 1024) => ({
  name,
  size,
  browser_download_url: `https://github.com/maxscharwath/kroma/releases/download/canary/${name}`,
  digest: null,
  created_at: createdAt,
});

const rolling = (tag: string, assets: ReturnType<typeof asset>[]) =>
  Release.parse({
    tag_name: tag,
    prerelease: true,
    published_at: '2026-07-10T19:42:27Z',
    html_url: `https://github.com/maxscharwath/kroma/releases/tag/${tag}`,
    assets,
  });

const CANARY_RUN = [
  asset('tv.kroma.webos_0.1.39_all.ipk', '2026-08-21T03:58:37Z'),
  asset('KROMA_0.1.39-canary.20260821_amd64.AppImage', '2026-08-21T03:58:37Z'),
  asset('KROMA-tizen-0.1.39-canary.20260821.wgt', '2026-08-21T03:58:36Z'),
  asset('canary-manifest.json', '2026-08-21T03:58:35Z'),
  asset('KROMA_0.1.39-canary.20260821_x64-setup.exe', '2026-08-21T03:58:35Z'),
  asset('KROMA_0.1.39-canary.20260821_amd64.deb', '2026-08-21T03:58:35Z'),
  asset('KROMA_0.1.39-canary.20260821_aarch64.dmg', '2026-08-21T03:58:35Z'),
  asset('KROMA-androidtv-0.1.39-canary.20260821.apk', '2026-08-21T03:58:35Z'),
];

describe('versionOf', () => {
  it('reads the version out of every name a channel build carries', () => {
    expect(versionOf('KROMA_0.1.39-canary.20260821_amd64.AppImage')).toBe('0.1.39-canary.20260821');
    expect(versionOf('KROMA-tizen-0.1.39-canary.20260821.wgt')).toBe('0.1.39-canary.20260821');
    expect(versionOf('kroma-0.1.38.3482831-x86_64.spk')).toBe('0.1.38.3482831');
    expect(versionOf('KROMA_0.1.39-3490257_aarch64.dmg')).toBe('0.1.39-3490257');
    expect(versionOf('tv.kroma.webos_0.1.39_all.ipk')).toBe('0.1.39');
  });

  it('carries no extension into the version', () => {
    expect(versionOf('KROMA-androidtv-0.1.39-canary.20260821.apk')).toBe('0.1.39-canary.20260821');
  });

  it('answers null for a name that names no version', () => {
    expect(versionOf('kroma-canary-x86_64.spk')).toBeNull();
    expect(versionOf('canary-manifest.json')).toBeNull();
  });
});

describe('toChannelBuilds', () => {
  it('collects the files one run uploaded into a single build', () => {
    const [canary, ...rest] = toChannelBuilds(rolling('canary', CANARY_RUN));

    expect(rest).toEqual([]);
    expect(canary?.version).toBe('0.1.39-canary.20260821');
    expect(canary?.builtAt).toBe('2026-08-21T03:58:37.000Z');
    expect(canary?.downloads.map((d) => d.target)).toEqual([
      'androidtv',
      'linux-appimage',
      'linux-deb',
      'macos',
      'tizen',
      'webos',
      'windows-exe',
    ]);
  });

  it('keeps two pushes inside the same hour apart', () => {
    const builds = toChannelBuilds(
      rolling('canary', [
        asset('kroma-0.1.38.3488516-x86_64.spk', '2026-08-19T14:02:37Z'),
        asset('kroma-0.1.38.3488548-x86_64.spk', '2026-08-19T14:40:15Z'),
      ]),
    );

    expect(builds.map((b) => b.version)).toEqual(['0.1.38.3488548', '0.1.38.3488516']);
  });

  it('folds the file naming only the bare version into the dated build beside it', () => {
    const [canary] = toChannelBuilds(rolling('canary', CANARY_RUN));

    expect(canary?.version).toBe('0.1.39-canary.20260821');
    expect(canary?.downloads.map((d) => d.name)).toContain('tv.kroma.webos_0.1.39_all.ipk');
  });

  it('holds a run whose uploads are spread over twenty minutes together', () => {
    const builds = toChannelBuilds(
      rolling('desktop-latest', [
        asset('KROMA_0.1.39-3490257_aarch64.dmg', '2026-08-20T19:01:13Z'),
        asset('KROMA_0.1.39-3490257_x64-setup.exe', '2026-08-20T19:15:48Z'),
        asset('KROMA_0.1.39-3490257_amd64.deb', '2026-08-20T19:23:32Z'),
        asset('KROMA_0.1.39-3490257_amd64.AppImage', '2026-08-20T19:24:19Z'),
      ]),
    );

    expect(builds).toHaveLength(1);
    expect(builds[0]?.downloads).toHaveLength(4);
  });

  it('splits two pushes hours apart into two builds, newest first', () => {
    const builds = toChannelBuilds(
      rolling('canary', [
        asset('kroma-0.1.38.3482831-x86_64.spk', '2026-08-15T15:22:51Z'),
        asset('kroma-0.1.38.3482901-x86_64.spk', '2026-08-15T16:33:42Z'),
        asset('kroma-0.1.39.3490258-x86_64.spk', '2026-08-20T19:14:56Z'),
      ]),
    );

    expect(builds.map((b) => b.version)).toEqual([
      '0.1.39.3490258',
      '0.1.38.3482901',
      '0.1.38.3482831',
    ]);
  });

  it('drops the sidecars a rolling tag carries beside its installers', () => {
    const builds = toChannelBuilds(
      rolling('canary', [
        asset('kroma-0.1.39.3490258-x86_64.spk', '2026-08-20T19:14:56Z'),
        asset('kroma-0.1.39.3490258-x86_64.spk.info.json', '2026-08-20T19:14:56Z'),
      ]),
    );

    expect(builds[0]?.downloads.map((d) => d.name)).toEqual(['kroma-0.1.39.3490258-x86_64.spk']);
  });

  it('lists no build for a run that left nothing installable', () => {
    expect(
      toChannelBuilds(rolling('canary', [asset('canary-manifest.json', '2026-08-21T03:58:35Z')])),
    ).toEqual([]);
  });

  it('lists no build when the tag does not exist', () => {
    expect(toChannelBuilds(undefined)).toEqual([]);
  });
});

describe('toCanaryBuilds', () => {
  it('collects both rolling tags into one list, newest build first', () => {
    const builds = toCanaryBuilds([
      rolling('canary', [
        ...CANARY_RUN,
        asset('kroma-0.1.39.3490258-x86_64.spk', '2026-08-20T19:14:56Z'),
        asset('kroma-0.1.38.3482831-x86_64.spk', '2026-08-15T15:22:51Z'),
      ]),
      rolling('desktop-latest', [
        asset('KROMA_0.1.39-3490257_aarch64.dmg', '2026-08-20T19:01:15Z'),
      ]),
    ]);

    expect(builds.map((b) => b.version)).toEqual([
      '0.1.39-canary.20260821',
      '0.1.39.3490258',
      '0.1.39-3490257',
      '0.1.38.3482831',
    ]);
  });

  it('offers the televisions the canary cut of the fleet carries', () => {
    const [newest] = toCanaryBuilds([rolling('canary', CANARY_RUN)]);

    expect(newest?.downloads.map((d) => d.target)).toEqual(
      expect.arrayContaining(['androidtv', 'tizen', 'webos']),
    );
  });

  it('answers with no build when the feed carries no rolling tag', () => {
    expect(toCanaryBuilds([])).toEqual([]);
  });
});
