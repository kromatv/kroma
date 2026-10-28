import { afterEach, describe, expect, it, vi } from 'vitest';
import { rollingReleases } from './downloads';

const release = {
  tag_name: 'desktop-latest',
  body: 'Release notes are not needed in the installer response.',
  html_url: 'https://github.com/kromatv/kroma/releases/tag/desktop-latest',
  assets: [
    {
      name: 'KROMA_0.1.40_x64.dmg',
      size: 1024,
      browser_download_url:
        'https://github.com/kromatv/kroma/releases/download/desktop-latest/intel.dmg',
    },
    {
      name: 'tv.kroma.scene.kmod',
      size: 1024,
      browser_download_url:
        'https://github.com/kromatv/kroma/releases/download/desktop-latest/scene.kmod',
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe('rollingReleases', () => {
  it('returns only installers and strips release prose', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(Response.json(release))),
    );
    const releases = await rollingReleases({});
    expect(releases).toHaveLength(2);
    expect(releases[0]?.body).toBeUndefined();
    expect(releases[0]?.assets.map((asset) => asset.name)).toEqual(['KROMA_0.1.40_x64.dmg']);
  });

  it('accepts a missing rolling tag without failing the other one', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation((url: string) =>
          Promise.resolve(
            url.endsWith('/canary') ? new Response(null, { status: 404 }) : Response.json(release),
          ),
        ),
    );
    expect(await rollingReleases({})).toHaveLength(1);
  });

  it('returns no releases when neither tag exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(new Response(null, { status: 404 }))),
    );
    expect(await rollingReleases({})).toEqual([]);
  });

  it('rejects an upstream server error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(new Response(null, { status: 502 }))),
    );
    await expect(rollingReleases({})).rejects.toThrow('answered 502');
  });

  it('rejects an empty response body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(new Response(null))),
    );
    await expect(rollingReleases({})).rejects.toThrow('no release body');
  });

  it.each(['not json', JSON.stringify({ tag_name: 'desktop-latest' })])(
    'rejects a malformed release document',
    async (body) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(() => Promise.resolve(new Response(body))),
      );
      await expect(rollingReleases({})).rejects.toThrow();
    },
  );

  it('cancels an oversized upstream stream before parsing it', async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1));
              },
              cancel,
            }),
          ),
        ),
      ),
    );
    await expect(rollingReleases({})).rejects.toThrow('exceeds size limit');
    expect(cancel).toHaveBeenCalled();
  });
});
