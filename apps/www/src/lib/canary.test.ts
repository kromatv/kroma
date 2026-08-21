import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCanary } from './canary.ts';

const build = () => ({
  version: '0.1.39',
  commit: { short: '4a858c9', title: 'a commit' },
  run: { url: 'https://github.com/x/y/actions/runs/1', finishedAt: '2026-08-20T19:14:35Z' },
  files: [
    {
      target: 'tizen',
      label: 'Samsung',
      contains: ['.wgt'],
      bytes: 1024,
      url: 'https://kroma.tv/api/canary/dl/1/tizen',
    },
  ],
});

const answering = (body: unknown, ok = true) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, text: () => Promise.resolve(JSON.stringify(body)) }),
  );

afterEach(() => vi.unstubAllGlobals());

describe('fetchCanary', () => {
  it('reads the builds the channel is offering', async () => {
    answering({ generatedAt: '2026-08-21T00:00:00Z', builds: [build()] });

    const builds = await fetchCanary();

    expect(builds).toHaveLength(1);
    expect(builds[0]?.files[0]?.label).toBe('Samsung');
  });

  it('answers an empty list rather than throwing when the channel refuses', async () => {
    answering({}, false);

    expect(await fetchCanary()).toEqual([]);
  });

  it('answers an empty list when the channel cannot be reached at all', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    expect(await fetchCanary()).toEqual([]);
  });

  it('drops an answer orders of magnitude larger than the document should be', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('x'.repeat(600_000)) }),
    );

    expect(await fetchCanary()).toEqual([]);
  });

  it('drops a body that is not the document this site asked for', async () => {
    answering({ builds: [{ commit: 'not an object' }] });

    expect(await fetchCanary()).toEqual([]);
  });

  it('drops a body that is not JSON at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('<html>nope') }),
    );

    expect(await fetchCanary()).toEqual([]);
  });

  it('asks for the limit it was given', async () => {
    const spy = vi
      .fn()
      .mockResolvedValue({ ok: true, text: () => Promise.resolve('{"builds":[]}') });
    vi.stubGlobal('fetch', spy);

    await fetchCanary(5);

    expect(String(spy.mock.calls[0]?.[0])).toContain('limit=5');
  });
});
