import { describe, expect, it } from 'vitest';
import type { Entry, SpkInfo } from './catalog';
import { mb, toRelease } from './release';

const entry = (over: Partial<Entry> = {}): Entry => ({
  channel: 'stable',
  tag: 'v0.1.25',
  releaseName: 'KROMA 0.1.25',
  releaseUrl: 'https://github.com/maxscharwath/kroma/releases/tag/v0.1.25',
  publishedAt: '2026-03-04T09:12:33Z',
  spkName: 'kroma-0.1.25-3439372-x86_64.spk',
  spkUrl: 'https://dl.test/kroma-0.1.25-3439372-x86_64.spk',
  spkSize: 52428800,
  notes: 'Fixes the thing.',
  info: null,
  ...over,
});

const info = (over: Partial<SpkInfo> = {}): SpkInfo => ({
  package: 'kroma',
  version: '0.1.26-3500000',
  dname: 'KROMA',
  desc: 'KROMA',
  arch: 'x86_64',
  firmware: '7.0-40000',
  size: 10485760,
  md5: 'd41d8cd98f00b204e9800998ecf8427e',
  beta: false,
  ...over,
});

describe('mb', () => {
  it('rounds to one decimal', () => {
    expect(mb(1048576)).toBe('1.0 MB');
    expect(mb(52428800)).toBe('50.0 MB');
    expect(mb(1572864)).toBe('1.5 MB');
  });
});

describe('toRelease', () => {
  it('reads the version out of the spk name when no sidecar was published', () => {
    expect(toRelease(entry())).toEqual({
      channel: 'stable',
      version: '0.1.25-3439372',
      day: '2026-03-04',
      size: '50.0 MB',
      spk: 'https://dl.test/kroma-0.1.25-3439372-x86_64.spk',
      release: 'https://github.com/maxscharwath/kroma/releases/tag/v0.1.25',
      notes: 'Fixes the thing.',
      md5: null,
    });
  });

  it('prefers the sidecar for the version, the size and the checksum', () => {
    const row = toRelease(entry({ info: info() }));
    expect(row.version).toBe('0.1.26-3500000');
    expect(row.size).toBe('10.0 MB');
    expect(row.md5).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });

  it('shows the day rather than the timestamp, and nothing when there is none', () => {
    expect(toRelease(entry()).day).toBe('2026-03-04');
    expect(toRelease(entry({ publishedAt: '' })).day).toBe('');
  });

  it('carries the channel through, so the nightly row can be labelled', () => {
    expect(toRelease(entry({ channel: 'nightly', tag: 'nightly' })).channel).toBe('nightly');
  });

  it('keeps a four-segment feature version, which is what the .spk stamps', () => {
    const row = toRelease(entry({ info: info({ version: '1.2.3.4500' }) }));
    expect(row.version).toBe('1.2.3.4500');
  });
});
