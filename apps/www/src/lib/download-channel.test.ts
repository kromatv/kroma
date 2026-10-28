import { describe, expect, it } from 'vitest';
import type { ChannelBuild } from './channels.ts';
import { canaryRelease, channelFromSearch } from './download-channel.ts';
import type { SiteDownload } from './releases.ts';

const file = (target: SiteDownload['target'], name: string): SiteDownload => ({
  target,
  name,
  url: `https://github.com/kromatv/kroma/releases/download/canary/${name}`,
  bytes: 1,
  sha256: null,
  builtAt: null,
});

const build = (version: string, builtAt: string, downloads: SiteDownload[]): ChannelBuild => ({
  version,
  builtAt,
  downloads,
});

describe('channelFromSearch', () => {
  it('reads canary from the query and stable from anything else', () => {
    expect(channelFromSearch('?channel=canary')).toBe('canary');
    expect(channelFromSearch('?channel=nightly')).toBe('stable');
    expect(channelFromSearch('')).toBe('stable');
  });
});

describe('canaryRelease', () => {
  it('is null when CI published nothing outside a release', () => {
    expect(canaryRelease([])).toBeNull();
  });

  it('takes each platform from the newest build that carries it', () => {
    const desktopOnly = build('0.1.40-3580000', '2026-10-20T12:00:00Z', [
      file('macos', 'KROMA_0.1.40-3580000_aarch64.dmg'),
    ]);
    const fleet = build('0.1.40-canary.3570000', '2026-10-19T12:00:00Z', [
      file('macos', 'KROMA_0.1.40-canary.3570000_aarch64.dmg'),
      file('synology', 'kroma-0.1.40.3570000-x86_64.spk'),
    ]);

    const release = canaryRelease([desktopOnly, fleet]);

    expect(release?.version).toBe('0.1.40-3580000');
    expect(release?.publishedAt).toBe('2026-10-20T12:00:00Z');
    expect(release?.downloads.map((d) => d.name)).toEqual([
      'KROMA_0.1.40-3580000_aarch64.dmg',
      'kroma-0.1.40.3570000-x86_64.spk',
    ]);
  });
  it('keeps an Intel upload that lands after the Apple silicon upload', () => {
    const release = canaryRelease([
      build('0.1.40-3580000', '2026-10-20T12:30:00Z', [
        { ...file('macos-intel', 'intel.dmg'), builtAt: '2026-10-20T12:30:00Z' },
        { ...file('macos', 'apple.dmg'), builtAt: '2026-10-20T12:00:00Z' },
      ]),
    ]);
    expect(release?.downloads.map((download) => download.target)).toEqual(['macos-intel', 'macos']);
  });

  it('offers one file per platform when a rolling bucket carries duplicate uploads', () => {
    const release = canaryRelease([
      build('0.1.40', '2026-10-20T12:30:00Z', [
        { ...file('tizen', 'old.wgt'), builtAt: '2026-10-20T12:00:00Z' },
        { ...file('tizen', 'new.wgt'), builtAt: '2026-10-20T12:30:00Z' },
      ]),
    ]);
    expect(release?.downloads.map((download) => download.name)).toEqual(['new.wgt']);
  });
});
