import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.ts';

vi.mock('@tanstack/react-start/server-entry', () => ({
  default: { fetch: () => Promise.resolve(new Response('a page', { status: 200 })) },
}));
vi.mock('./src/paraglide/server.js', () => ({
  paraglideMiddleware: (_request: Request, resolve: () => Promise<Response>) => resolve(),
}));

const ctx = { waitUntil: () => undefined };
const env = { GITHUB_TOKEN: 'token' };
const get = (path: string, method = 'GET') =>
  worker.fetch(new Request(`https://kroma.tv${path}`, { method }), env, ctx);

afterEach(() => vi.unstubAllGlobals());

describe('the site worker', () => {
  it('hands anything that is not the API to the page handler', async () => {
    const res = await get('/download/archive');

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('a page');
  });

  it('refuses a method the API does not answer', async () => {
    expect((await get('/api/canary/index.json', 'POST')).status).toBe(405);
  });

  it('answers 404 for a path under the API that is not a route', async () => {
    expect((await get('/api/canary/nope')).status).toBe(404);
  });

  it('refuses a run id a path segment could otherwise smuggle in', async () => {
    expect((await get('/api/canary/dl/0/tizen')).status).toBe(404);
  });

  it('refuses a platform this channel does not offer', async () => {
    expect((await get('/api/canary/dl/12345/plan9')).status).toBe(404);
  });

  it('answers 503 rather than throwing when GitHub cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const res = await get('/api/canary/index.json');

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'canary unavailable' });
  });

  it('lists the builds a run left, pointing every file at this origin', async () => {
    const run = {
      id: 32406018041,
      head_sha: 'a'.repeat(40),
      html_url: 'https://github.com/x/y/actions/runs/32406018041',
      updated_at: '2026-08-20T19:14:35Z',
      display_title: 'a commit',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: unknown) => {
        const url = String(input);
        if (url.includes('/runs?')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ workflow_runs: [run] }),
          });
        }
        if (url.includes('/artifacts')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                artifacts: [
                  { id: 9, name: 'kroma-tizen-wgt', size_in_bytes: 1024, expired: false },
                ],
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('version = "0.1.39"'),
        });
      }),
    );

    const res = await get('/api/canary/index.json?limit=1');
    const body = (await res.json()) as { builds: { files: { url: string }[] }[] };

    expect(res.status).toBe(200);
    expect(body.builds[0]?.files[0]?.url).toBe('https://kroma.tv/api/canary/dl/32406018041/tizen');
  });

  it('redirects a download to the storage URL, so the bytes never cross this worker', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: unknown) =>
        String(input).endsWith('/zip')
          ? Promise.resolve({ headers: new Headers({ location: 'https://blob/x.zip' }) })
          : Promise.resolve({
              ok: true,
              status: 200,
              json: () =>
                Promise.resolve({
                  artifacts: [
                    { id: 9, name: 'kroma-tizen-wgt', size_in_bytes: 1024, expired: false },
                  ],
                }),
            }),
      ),
    );

    const res = await get('/api/canary/dl/32406018041/tizen');

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://blob/x.zip');
  });

  it('answers 502 when GitHub declines to hand over a signed URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: unknown) =>
        String(input).endsWith('/zip')
          ? Promise.resolve({ headers: new Headers() })
          : Promise.resolve({
              ok: true,
              status: 200,
              json: () =>
                Promise.resolve({
                  artifacts: [
                    { id: 9, name: 'kroma-tizen-wgt', size_in_bytes: 1024, expired: false },
                  ],
                }),
            }),
      ),
    );

    expect((await get('/api/canary/dl/32406018041/tizen')).status).toBe(502);
  });

  it('answers 404 for a build whose artifacts this platform has none of', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ artifacts: [] }),
      }),
    );

    expect((await get('/api/canary/dl/32406018041/tizen')).status).toBe(404);
  });
});
