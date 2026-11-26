import { describe, expect, it } from 'vitest';
import { stackTop, tvScreens } from './tv-screens';

const MOVIE = { id: 'm1', title: 'Dune', kind: 'movie' };
const SHOW = { id: 's1', title: 'Severance' };

describe('the screens of the TV app a sweep reads', () => {
  it('are home, the grids, the genres, search, the settings and the release notes', () => {
    const labels = tvScreens({ movie: undefined, show: undefined }).map((screen) => screen.label);

    expect(labels).toEqual([
      'home',
      'grid films',
      'grid series',
      'grid mylist',
      'genres',
      'search',
      'profileMenu',
      'releases',
    ]);
  });

  it('open each over home, so Back has somewhere to go', () => {
    const [, grid] = tvScreens({ movie: undefined, show: undefined });

    expect(grid?.stack).toEqual([{ name: 'home' }, { name: 'grid', params: { kind: 'films' } }]);
  });

  it('end with the detail of a movie and a show of the library', () => {
    const screens = tvScreens({ movie: MOVIE, show: SHOW });

    expect(screens.slice(-2)).toEqual([
      {
        label: 'movie Dune',
        stack: [{ name: 'home' }, { name: 'movie', params: { item: MOVIE } }],
      },
      {
        label: 'show Severance',
        stack: [{ name: 'home' }, { name: 'show', params: { show: SHOW } }],
      },
    ]);
  });
});

describe('the route the TV router landed on', () => {
  it('is the top of the stack it mirrors', () => {
    expect(stackTop(JSON.stringify([{ name: 'home' }, { name: 'search' }]))).toBe('search');
  });

  it.each([
    ['no stack', null],
    ['an empty stack', '[]'],
    ['a stack of something else', '["home"]'],
  ])('is nothing for %s', (_what, stored) => {
    expect(stackTop(stored)).toBeNull();
  });
});
