import { describe, expect, it } from 'vitest';
import { NO_FILTER, selectBuilds } from './build-select.ts';
import type { SiteDownload } from './releases.ts';

const download = (target: string, name: string): SiteDownload =>
  ({
    target,
    name,
    url: `https://github.com/x/y/releases/download/v1/${name}`,
    bytes: 1024,
    sha256: null,
    builtAt: null,
  }) as SiteDownload;

const build = (version: string, downloads: SiteDownload[]) => ({ version, downloads });
const read = (b: { version: string; downloads: SiteDownload[] }) => b;

const FLEET = [
  build('0.1.38', [download('macos', 'a.dmg'), download('tizen', 'b.wgt')]),
  build('0.1.37', [download('synology', 'c.spk')]),
];

describe('selectBuilds', () => {
  it('keeps every build and every file when nothing is filtered', () => {
    const rows = selectBuilds(FLEET, read, NO_FILTER);

    expect(rows.map((r) => r.item.version)).toEqual(['0.1.38', '0.1.37']);
    expect(rows[0]?.downloads).toHaveLength(2);
  });

  it('narrows to one platform, and drops a build left with no file', () => {
    const rows = selectBuilds(FLEET, read, { label: 'macOS', query: '' });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.item.version).toBe('0.1.38');
    expect(rows[0]?.downloads.map((d) => d.target)).toEqual(['macos']);
  });

  it('matches a version by substring, whatever the case', () => {
    expect(selectBuilds(FLEET, read, { label: null, query: '0.1.37' })).toHaveLength(1);
    expect(selectBuilds(FLEET, read, { label: null, query: '0.1.' })).toHaveLength(2);
    expect(selectBuilds(FLEET, read, { label: null, query: '  0.1.38  ' })).toHaveLength(1);
  });

  it('answers nothing when the version matches no build', () => {
    expect(selectBuilds(FLEET, read, { label: null, query: '9.9.9' })).toEqual([]);
  });

  it('applies the platform and the version together', () => {
    expect(selectBuilds(FLEET, read, { label: 'macOS', query: '0.1.37' })).toEqual([]);
    expect(selectBuilds(FLEET, read, { label: 'macOS', query: '0.1.38' })).toHaveLength(1);
  });

  it('treats a build with a null version as unmatched rather than crashing', () => {
    const unnamed = [{ version: null, downloads: [download('macos', 'a.dmg')] }];

    expect(selectBuilds(unnamed, (b) => b, { label: null, query: '0.1' })).toEqual([]);
    expect(selectBuilds(unnamed, (b) => b, NO_FILTER)).toHaveLength(1);
  });
});
