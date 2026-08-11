import { describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  fetch: vi.fn(async (_request: Request) => new Response('rendered')),
  order: [] as string[],
  localized: null as Request | null,
}));

vi.mock('@tanstack/react-start/server-entry', () => ({
  default: {
    fetch: (request: Request) => {
      H.order.push('handler');
      return H.fetch(request);
    },
  },
}));

vi.mock('#site/paraglide/server', () => ({
  paraglideMiddleware: (request: Request, run: () => Promise<Response>) => {
    H.localized = request;
    H.order.push('middleware');
    return run();
  },
}));

const { default: server } = await import('./server');

describe('the site server entry', () => {
  it('resolves the locale before the page renders, not after', async () => {
    const request = new Request('https://kroma.tv/fr/blog');
    const response = await server.fetch(request);

    expect(H.order).toEqual(['middleware', 'handler']);
    expect(H.localized).toBe(request);
    expect(H.fetch).toHaveBeenCalledWith(request);
    expect(await response.text()).toBe('rendered');
  });
});
