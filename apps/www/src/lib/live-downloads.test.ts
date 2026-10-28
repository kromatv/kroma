import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLatestDownloads } from './live-downloads';

afterEach(() => vi.unstubAllGlobals());

describe('live downloads', () => {
  it('classifies a newly uploaded Intel DMG', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json([
          {
            tag_name: 'desktop-latest',
            html_url: 'https://github.com/kromatv/kroma/releases/tag/desktop-latest',
            assets: [
              {
                name: 'KROMA_0.1.40-3580000_x64.dmg',
                size: 1024,
                browser_download_url:
                  'https://github.com/kromatv/kroma/releases/download/desktop-latest/intel.dmg',
                created_at: '2026-10-28T17:30:00Z',
              },
            ],
          },
        ]),
      ),
    );
    const builds = await fetchLatestDownloads(new AbortController().signal);
    expect(builds[0]?.downloads[0]?.target).toBe('macos-intel');
  });

  it.each([
    () => Promise.reject(new Error('offline')),
    () => Promise.resolve(new Response(null, { status: 503 })),
    () => Promise.resolve(Response.json({ broken: true })),
  ])('leaves the baked downloads available when refreshing fails', async (upstream) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(upstream));
    expect(await fetchLatestDownloads(new AbortController().signal)).toEqual([]);
  });
});
