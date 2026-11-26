// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { clippedTree, FakePage, fakeReader } from './fake-page.fixture';
import { routeOf } from './web-routes';
import { sweepWeb } from './web-sweep';

const ORIGIN = 'http://localhost:3200';
const ROUTES = ['_app.index.tsx', '_app.movies.$id.tsx', 'admin.index.tsx'].map(routeOf);
const LINKS: Record<string, string> = {
  '/': '<a href="/movies/abc">A</a><a href="/movies/def">B</a><a href="https://kroma.tv/x">C</a>',
};

function serve(page: FakePage) {
  const path = new URL(page.at).pathname;
  if (path === '/movies/def') {
    throw new Error('net::ERR_ABORTED');
  }
  if (path === '/admin') {
    page.at = `${ORIGIN}/login`;
  }
  document.documentElement.lang = 'de';
  document.body.innerHTML = LINKS[path] ?? '';
  vi.stubGlobal('__KROMA_UI__', fakeReader(clippedTree('Gefolgt')));
}

function linkingToBroken(page: FakePage) {
  serve(page);
  document.body.innerHTML = '<a href="/movies/def">B</a>';
}

function inOne(page: FakePage) {
  return <T>(read: (page: FakePage) => Promise<T>) => read(page);
}

const run = (maxPages: number) => ({ origin: ORIGIN, language: 'de', routes: ROUTES, maxPages });

describe('a crawl of the web client', () => {
  it('reads each page it reaches once, one title for every title', async () => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const found = await sweepWeb(inOne(new FakePage(serve)), run(10));

    expect(found.clips.map((clip) => clip.screen)).toEqual([
      '/',
      '/admin -> /login',
      '/movies/abc',
    ]);
    expect(found.unread).toEqual([]);
  });

  it('stops at the most pages it may visit', async () => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const found = await sweepWeb(inOne(new FakePage(serve)), run(1));

    expect(found.clips.map((clip) => clip.screen)).toEqual(['/']);
  });

  it('lists a page that would not load, and goes on', async () => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const routes = ['_app.movies.$id.tsx', '_app.index.tsx'].map(routeOf);

    const found = await sweepWeb(inOne(new FakePage(linkingToBroken)), { ...run(10), routes });

    expect(found.unread).toEqual([
      { language: 'de', target: 'web', screen: '/movies/def', reason: 'net::ERR_ABORTED' },
    ]);
  });
});
