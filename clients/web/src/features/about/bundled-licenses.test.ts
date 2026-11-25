import { afterEach, describe, expect, it, vi } from 'vitest';
import { bundledLicenses } from './bundled-licenses';

afterEach(() => {
  vi.unstubAllGlobals();
});

const serving = (response: Response) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response),
  );

describe('bundledLicenses', () => {
  it('reads the licenses file the build wrote beside itself', async () => {
    serving(new Response(JSON.stringify({ texts: ['MIT'], entries: [] })));

    const licenses = await bundledLicenses();

    expect(licenses).toEqual({ texts: ['MIT'], entries: [] });
  });

  it('answers null where the build wrote none', async () => {
    serving(new Response('', { status: 404 }));

    const licenses = await bundledLicenses();

    expect(licenses).toBeNull();
  });

  it('answers null for a file of another shape', async () => {
    serving(new Response(JSON.stringify({ packages: [] })));

    const licenses = await bundledLicenses();

    expect(licenses).toBeNull();
  });
});
