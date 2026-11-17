import { afterEach, describe, expect, it, vi } from 'vitest';
import server from './server';

const rendered = vi.hoisted((): string[] => []);

vi.mock('@tanstack/react-start/server-entry', () => ({
  default: {
    fetch: (request: Request) => {
      rendered.push(new URL(request.url).pathname);
      return new Response('<html lang="en"><head></head><body></body></html>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    },
  },
}));

afterEach(() => {
  rendered.length = 0;
  vi.unstubAllGlobals();
});

describe('the worker entry', () => {
  it('answers a route Lingua handles itself without rendering a page', async () => {
    const response = await server.fetch(new Request('https://lingua.test/health'), {
      LINGUA_PROJECTS: 'o/r, o/s@next',
    });

    expect(await response.json()).toEqual({ ok: true, signIn: false, projects: 2 });
    expect(rendered).toEqual([]);
  });

  it('renders every other path as a page, with the Worker’s own bindings', async () => {
    vi.stubGlobal('KROMA_WORKERD', { env: {} });

    const response = await server.fetch(new Request('https://lingua.test/o/r'));

    expect(response.headers.get('content-type')).toContain('text/html');
    expect(rendered).toEqual(['/o/r']);
  });

  it('forbids framing and content sniffing on a page and on a route alike', async () => {
    vi.stubGlobal('KROMA_WORKERD', { env: {} });

    const answers = await Promise.all([
      server.fetch(new Request('https://lingua.test/o/r')),
      server.fetch(new Request('https://lingua.test/health'), {}),
    ]);

    for (const { headers } of answers) {
      expect(headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
      expect(headers.get('x-frame-options')).toBe('DENY');
      expect(headers.get('x-content-type-options')).toBe('nosniff');
    }
  });

  it('runs the cron’s sync pass past the scheduled event', async () => {
    const held: Promise<unknown>[] = [];

    server.scheduled(undefined, {}, { waitUntil: (p) => held.push(p) });

    await expect(Promise.all(held)).resolves.toEqual([undefined]);
  });
});
