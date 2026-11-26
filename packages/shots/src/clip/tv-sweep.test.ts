// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { clippedTree, FakePage, fakeReader } from './fake-page.fixture';
import type { TvScreen } from './tv-screens';
import { sweepTv } from './tv-sweep';

const ORIGIN = 'http://localhost:5274';
const HOME = { name: 'home' };
const SEARCH: TvScreen = { label: 'search', stack: [HOME, { name: 'search' }] };
const GENRES: TvScreen = { label: 'genres', stack: [HOME, { name: 'genres' }] };

function speaking(language: string) {
  return () => {
    document.documentElement.lang = language;
    vi.stubGlobal('__KROMA_UI__', fakeReader(clippedTree('Suche')));
  };
}

function inOne(page: FakePage) {
  return <T>(read: (page: FakePage) => Promise<T>) => read(page);
}

const run = (screens: readonly TvScreen[]) => ({
  origin: ORIGIN,
  target: 'tizen',
  language: 'de',
  screens,
});

describe('a sweep of the TV app', () => {
  it('lands on each screen through the stack it restores, and reads it', async () => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const page = new FakePage(speaking('de'));
    const goto = vi.spyOn(page, 'goto');

    const found = await sweepTv(inOne(page), run([SEARCH, GENRES]));

    expect(found.unread).toEqual([]);
    expect(found.clips.map((clip) => clip.screen)).toEqual(['search', 'genres']);
    expect(goto).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('kroma:dev-nav')).toBe(JSON.stringify(GENRES.stack));
  });

  it('reads nothing of a screen the router did not land on', async () => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const page = new FakePage(() => {
      speaking('de')();
      sessionStorage.setItem('kroma:dev-nav', JSON.stringify([HOME]));
    });

    const found = await sweepTv(inOne(page), run([SEARCH]));

    expect(found.unread.map((unread) => unread.reason)).toEqual(['the router went to home']);
  });

  it('says so when the router kept no stack at all', async () => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const page = new FakePage(() => {
      speaking('de')();
      sessionStorage.clear();
    });

    const found = await sweepTv(inOne(page), run([SEARCH]));

    expect(found.unread.map((unread) => unread.reason)).toEqual(['the router went to nothing']);
  });

  it('lists a screen whose read failed, and goes on to the next', async () => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const page = new FakePage(speaking('de'));
    const crashing = <T>(read: (page: FakePage) => Promise<T>) =>
      page.at === 'about:blank' ? Promise.reject(new Error('the page crashed')) : read(page);

    const failed = await sweepTv(crashing, run([SEARCH]));
    await page.goto(`${ORIGIN}/`);
    const next = await sweepTv(crashing, run([GENRES]));

    expect(failed).toEqual({
      clips: [],
      unread: [{ language: 'de', target: 'tizen', screen: 'search', reason: 'the page crashed' }],
    });
    expect(next.clips.map((clip) => clip.screen)).toEqual(['genres']);
  });
});
