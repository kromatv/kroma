import { afterEach, describe, expect, it, vi } from 'vitest';
import { iconPath, iconResponse, withIconUrls } from './icon';

const entry = (id: string, version: string, icon?: string | null) => ({ id, version, icon });

const DATA = 'data:image/svg+xml;base64,PHN2Zy8+';

describe('iconPath', () => {
  it('carries the version, so the answer can be cached forever', () => {
    expect(iconPath('tv.kroma.vpn', '1.2.3')).toBe('/icon/tv.kroma.vpn/1.2.3.svg');
  });

  it('encodes an id or version that would otherwise break the path', () => {
    expect(iconPath('a/b', '1 0')).toBe('/icon/a%2Fb/1%200.svg');
  });

  it('stands in for a missing version rather than emitting an empty segment', () => {
    expect(iconPath('tv.kroma.vpn', '')).toBe('/icon/tv.kroma.vpn/0.svg');
  });
});

describe('withIconUrls', () => {
  it('replaces a data URI with the route that serves it', () => {
    const [out] = withIconUrls([entry('tv.kroma.vpn', '1.0.0', DATA)]);
    expect(out?.icon).toBe('/icon/tv.kroma.vpn/1.0.0.svg');
  });

  it('leaves a real URL and a missing icon alone', () => {
    const out = withIconUrls([
      entry('a', '1', 'https://example.test/a.svg'),
      entry('b', '1', null),
      entry('c', '1'),
    ]);
    expect(out[0]?.icon).toBe('https://example.test/a.svg');
    expect(out[1]?.icon).toBeNull();
    expect(out[2]?.icon).toBeUndefined();
  });

  it('does not mutate the entries it was given', () => {
    const original = entry('tv.kroma.vpn', '1.0.0', DATA);
    withIconUrls([original]);
    expect(original.icon).toBe(DATA);
  });
});

const SVG = '<svg width="24"/>';
const svgData = `data:image/svg+xml;base64,${btoa(SVG)}`;

function catalogServing(modules: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ schema: 2, modules })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('iconResponse', () => {
  it('declines a path that is not an icon, so the request falls through', async () => {
    for (const path of ['/', '/modules.json', '/icon/', '/icon/a.svg', '/icon/a/b/c.svg']) {
      expect(await iconResponse(path, {}, () => {})).toBeNull();
    }
  });

  it('decodes the data URI and serves it as an immutable SVG', async () => {
    vi.stubGlobal('caches', undefined);
    catalogServing([{ id: 'tv.kroma.vpn', version: '1.0.0', icon: svgData }]);

    const res = await iconResponse('/icon/tv.kroma.vpn/1.0.0.svg', {}, () => {});

    expect(res?.status).toBe(200);
    expect(res?.headers.get('content-type')).toBe('image/svg+xml');
    expect(res?.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(await res?.text()).toBe(SVG);
  });

  it('reads the id back through the encoding iconPath applied', async () => {
    vi.stubGlobal('caches', undefined);
    catalogServing([{ id: 'a/b', version: '1', icon: svgData }]);

    const res = await iconResponse(iconPath('a/b', '1'), {}, () => {});
    expect(await res?.text()).toBe(SVG);
  });

  it('serves the current artwork whatever version the path names', async () => {
    vi.stubGlobal('caches', undefined);
    catalogServing([{ id: 'tv.kroma.vpn', version: '9.9.9', icon: svgData }]);

    const res = await iconResponse('/icon/tv.kroma.vpn/0.1.0.svg', {}, () => {});
    expect(await res?.text()).toBe(SVG);
  });

  it('answers 404 for a module that is not in the catalog', async () => {
    vi.stubGlobal('caches', undefined);
    catalogServing([{ id: 'tv.kroma.vpn', version: '1.0.0', icon: svgData }]);

    const res = await iconResponse('/icon/tv.kroma.absent/1.0.0.svg', {}, () => {});
    expect(res?.status).toBe(404);
  });

  it('answers 404 for a module whose icon is not a data URI to decode', async () => {
    vi.stubGlobal('caches', undefined);
    catalogServing([
      { id: 'a', version: '1', icon: 'https://example.test/a.svg' },
      { id: 'b', version: '1' },
    ]);

    expect((await iconResponse('/icon/a/1.svg', {}, () => {}))?.status).toBe(404);
    expect((await iconResponse('/icon/b/1.svg', {}, () => {}))?.status).toBe(404);
  });

  it('answers 503 rather than 404 when the catalog itself cannot be read', async () => {
    vi.stubGlobal('caches', undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );

    const res = await iconResponse('/icon/tv.kroma.vpn/1.0.0.svg', {}, () => {});
    expect(res?.status).toBe(503);
  });
});
