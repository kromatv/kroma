import { describe, expect, it } from 'vitest';
import { fakeFetch, hangingFetch } from './health-probe.fixture';
import { resolveServerOrigin } from './server-origin';

describe('resolveServerOrigin', () => {
  const H = '/api/health';

  it('prefers TLS on the standard port for a bare host', async () => {
    const fetch = fakeFetch({
      [`https://media.example.net${H}`]: {},
      [`http://media.example.net${H}`]: {},
    });
    expect(await resolveServerOrigin('media.example.net', { fetch })).toEqual({
      url: 'https://media.example.net',
      secure: true,
    });
  });

  it("falls back to this project's own port when the standard ones are dead", async () => {
    const fetch = fakeFetch({ [`http://media.example.net:4040${H}`]: {} });
    expect(await resolveServerOrigin('media.example.net', { fetch })).toEqual({
      url: 'http://media.example.net:4040',
      secure: false,
    });
  });

  // A plain-http probe SUCCEEDS against a server that redirects, so only the
  // final URL can be trusted for the padlock.
  it('reports https when http redirects to it', async () => {
    const fetch = fakeFetch({
      [`http://media.example.net${H}`]: { url: `https://media.example.net${H}` },
    });
    expect(await resolveServerOrigin('media.example.net', { fetch })).toEqual({
      url: 'https://media.example.net',
      secure: true,
    });
  });

  it('honours an explicit scheme and port exactly', async () => {
    const fetch = fakeFetch({ [`https://media.example.net:8443${H}`]: {} });
    expect(await resolveServerOrigin('https://media.example.net:8443', { fetch })).toEqual({
      url: 'https://media.example.net:8443',
      secure: true,
    });
  });

  it('tries 4040 for an explicit scheme with no port', async () => {
    const fetch = fakeFetch({ [`https://media.example.net:4040${H}`]: {} });
    expect(await resolveServerOrigin('https://media.example.net', { fetch })).toEqual({
      url: 'https://media.example.net:4040',
      secure: true,
    });
  });

  it('never swaps a typed scheme for the other one', async () => {
    const fetch = fakeFetch({ [`https://media.example.net${H}`]: {} });
    expect(await resolveServerOrigin('http://media.example.net', { fetch })).toBeNull();
  });

  it('is null when nothing answers, which is not the same as insecure', async () => {
    expect(await resolveServerOrigin('media.example.net', { fetch: fakeFetch({}) })).toBeNull();
  });

  it('ignores an empty address', async () => {
    expect(await resolveServerOrigin('   ', { fetch: fakeFetch({}) })).toBeNull();
  });

  it('ignores a host that serves /api/health without an ok status', async () => {
    const fetch = fakeFetch({ [`https://media.example.net${H}`]: { status: 'starting' } });
    expect(await resolveServerOrigin('media.example.net', { fetch })).toBeNull();
  });

  it('keeps the probed origin when the fetch implementation omits res.url', async () => {
    const fetch = fakeFetch({ [`https://media.example.net${H}`]: { url: '' } });
    expect(await resolveServerOrigin('media.example.net', { fetch })).toEqual({
      url: 'https://media.example.net',
      secure: true,
    });
  });

  it('keeps the probed origin when res.url is not a parseable URL', async () => {
    const fetch = fakeFetch({ [`https://media.example.net${H}`]: { url: 'kroma-health' } });
    expect(await resolveServerOrigin('media.example.net', { fetch })).toEqual({
      url: 'https://media.example.net',
      secure: true,
    });
  });

  it('abandons a host that accepts the connection and never answers', async () => {
    expect(
      await resolveServerOrigin('media.example.net', { fetch: hangingFetch, timeoutMs: 0 }),
    ).toBeNull();
  });
});
