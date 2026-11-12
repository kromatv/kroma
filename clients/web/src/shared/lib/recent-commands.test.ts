// @vitest-environment jsdom
import type { CommandItem } from '@kromatv/ui/kit';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CommandDef } from './command-menu';
import {
  type RecentCommand,
  readRecentCommands,
  recentFirst,
  rememberCommand,
  restoredCommands,
} from './recent-commands';

const VIEWER = 'viewer';

const page = (to: string, extra: object = {}) =>
  ({ label: to, to, ...extra }) as unknown as CommandDef;

const remembered = (viewer = VIEWER) => readRecentCommands(viewer).map(({ id }) => id);

const item = (id: string, group: string): CommandItem => ({ id, label: id, group });

const recentAt = (...ids: string[]): RecentCommand[] =>
  ids.map((id) => ({ id, label: id, to: id }));

const lift = (items: readonly CommandItem[], recent: readonly RecentCommand[], current?: string) =>
  recentFirst(items, recent, { group: 'Recent', pageGroup: 'This page', current }).map(
    ({ id, group }) => `${group}/${id}`,
  );

beforeEach(() => {
  localStorage.clear();
});

describe('rememberCommand', () => {
  it('remembers a place the viewer went', () => {
    rememberCommand(VIEWER, '/movies', page('/movies'));

    expect(remembered()).toEqual(['/movies']);
  });

  it('never remembers a row that does something, which one Enter would run again', () => {
    const logout = { label: 'Sign out', run: () => {} } as CommandDef;

    rememberCommand(VIEWER, 'logout', logout);

    expect(remembered()).toEqual([]);
  });

  it('does not remember a row that holds one moment’s query', () => {
    rememberCommand(VIEWER, 'everywhere', page('/search', { search: { q: 'dune' } }));

    expect(remembered()).toEqual([]);
  });

  it('does not remember a row it would restore without checking a capability', () => {
    const settings = page('/admin/modules/$id', { params: { id: 'roku' }, cap: 'settings.manage' });

    rememberCommand(VIEWER, 'module:roku', settings);

    expect(remembered()).toEqual([]);
  });

  it('remembers a plain page with a capability, which is checked when it is listed', () => {
    rememberCommand(VIEWER, '/admin', page('/admin', { cap: 'settings.manage' }));

    expect(remembered()).toEqual(['/admin']);
  });

  it('puts the latest first', () => {
    rememberCommand(VIEWER, '/a', page('/a'));
    rememberCommand(VIEWER, '/b', page('/b'));

    expect(remembered()).toEqual(['/b', '/a']);
  });

  it('moves a place visited again back to the front rather than listing it twice', () => {
    rememberCommand(VIEWER, '/a', page('/a'));
    rememberCommand(VIEWER, '/b', page('/b'));
    rememberCommand(VIEWER, '/a', page('/a'));

    expect(remembered()).toEqual(['/a', '/b']);
  });

  it('keeps only the last five', () => {
    for (const to of ['/1', '/2', '/3', '/4', '/5', '/6']) rememberCommand(VIEWER, to, page(to));

    expect(remembered()).toEqual(['/6', '/5', '/4', '/3', '/2']);
  });

  it('remembers a title with a search, which is part of where it goes', () => {
    const episode = page('/shows/$id', {
      params: { id: 's1' },
      search: { season: 2 },
      hash: 'episodes',
    });

    rememberCommand(VIEWER, 'title:e1', episode);

    expect(readRecentCommands(VIEWER)[0]).toMatchObject({
      search: { season: 2 },
      hash: 'episodes',
    });
  });

  it('keeps a title’s poster, so it looks the same when it comes back', () => {
    rememberCommand(VIEWER, 'title:m1', page('/movies/$id', { image: '/art/m1.jpg?w=60' }));

    expect(readRecentCommands(VIEWER)[0]?.image).toBe('/art/m1.jpg?w=60');
  });

  it('keeps a title’s second line', () => {
    rememberCommand(VIEWER, 'title:m1', page('/movies/$id', { subtitle: 'Film · 2024' }));

    expect(readRecentCommands(VIEWER)[0]?.subtitle).toBe('Film · 2024');
  });

  it('forgets what can go stale, such as whether it was watched', () => {
    rememberCommand(VIEWER, 'title:m1', page('/movies/$id', { meta: 'Vu' }));

    expect(readRecentCommands(VIEWER)[0]).not.toHaveProperty('meta');
  });

  it('never writes a media ticket to storage', () => {
    rememberCommand(
      VIEWER,
      'title:m1',
      page('/movies/$id', { image: '/art/m1.jpg?w=60&t=secret' }),
    );

    expect(localStorage.getItem(`kroma:command-menu:recent:${VIEWER}`)).not.toContain('secret');
  });

  it('keeps each profile’s places to itself on a shared device', () => {
    rememberCommand('first', '/a', page('/a'));

    expect(remembered('second')).toEqual([]);
  });
});

describe('readRecentCommands', () => {
  it('reads nothing from a value it did not write', () => {
    localStorage.setItem(`kroma:command-menu:recent:${VIEWER}`, '{not json');

    expect(readRecentCommands(VIEWER)).toEqual([]);
  });

  it('reads nothing from a value of the wrong shape', () => {
    localStorage.setItem(`kroma:command-menu:recent:${VIEWER}`, '[{"id":1}]');

    expect(readRecentCommands(VIEWER)).toEqual([]);
  });

  it('drops an icon name the kit cannot draw', () => {
    localStorage.setItem(
      `kroma:command-menu:recent:${VIEWER}`,
      '[{"id":"a","label":"a","to":"/a","icon":"not-a-glyph"}]',
    );

    expect(readRecentCommands(VIEWER)).toEqual([]);
  });
});

describe('restoredCommands', () => {
  it('brings a title back, since only a search would list it otherwise', () => {
    const title = { id: 'title:m1', label: 'Dune', to: '/movies/$id', params: { id: 'm1' } };

    expect(restoredCommands([title], 'Recent', [])).toMatchObject([
      { id: 'title:m1', label: 'Dune', group: 'Recent', params: { id: 'm1' } },
    ]);
  });

  it('never brings back a plain page, which this viewer may have lost the right to', () => {
    expect(restoredCommands(recentAt('/admin/network'), 'Recent', [])).toEqual([]);
  });

  it('leaves out one the menu already lists under that name, so it is not there twice', () => {
    const module = { id: 'module:roku', label: 'Roku', to: '/x/$id', params: { id: 'roku' } };
    const live = page('/admin/roku', { label: 'Roku' });

    expect(restoredCommands([module], 'Recent', [live])).toEqual([]);
  });
});

describe('recentFirst', () => {
  it('lifts recent rows above the others, latest first', () => {
    const items = [item('a', 'Nav'), item('b', 'Nav'), item('c', 'Nav')];

    expect(lift(items, recentAt('c', 'b'))).toEqual(['Recent/c', 'Recent/b', 'Nav/a']);
  });

  it('keeps what the page offers above them', () => {
    const items = [item('play', 'This page'), item('a', 'Nav')];

    expect(lift(items, recentAt('a'))).toEqual(['This page/play', 'Recent/a']);
  });

  it('leaves out the page the viewer is already on', () => {
    const items = [item('a', 'Nav'), item('b', 'Nav')];

    expect(lift(items, recentAt('a', 'b'), 'a')).toEqual(['Recent/b', 'Nav/a']);
  });

  it('leaves out a remembered title the viewer is already on', () => {
    const items = [item('a', 'Nav'), item('title:s1', 'Recent')];

    expect(lift(items, recentAt('title:s1'), 'title:s1')).toEqual(['Nav/a']);
  });

  it('ignores a place this viewer is no longer offered', () => {
    expect(lift([item('a', 'Nav')], recentAt('gone'))).toEqual(['Nav/a']);
  });

  it('changes nothing with no history', () => {
    const items = [item('a', 'Nav'), item('b', 'More')];

    expect(lift(items, [])).toEqual(['Nav/a', 'More/b']);
  });
});
