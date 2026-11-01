// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandDef } from '#web/shared/lib/command-menu';
import type { TitleView } from '#web/shared/lib/titleView';
import { useTitleCommands } from './use-title-commands';

const mocks = vi.hoisted(() => ({
  listed: false,
  watched: false,
  toggle: vi.fn(),
  toggleWatched: vi.fn(),
  commands: [] as readonly CommandDef[],
}));
vi.mock('@kromatv/ui', () => ({ useT: () => (key: string) => key }));
vi.mock('#web/shared/lib/mylist', () => ({
  useMyList: () => ({ inList: () => mocks.listed, toggle: mocks.toggle }),
}));
vi.mock('#web/shared/lib/watched', () => ({
  useWatched: () => ({ isWatched: () => mocks.watched, toggleWatched: mocks.toggleWatched }),
}));
vi.mock('#web/shared/lib/command-menu', () => ({
  useCommands: (commands: readonly (CommandDef | false | null | undefined | '')[]) => {
    mocks.commands = commands.filter((row): row is CommandDef => Boolean(row));
  },
}));

const VIEW = {
  kind: 'movie',
  title: 'Dune',
  tmdbId: 438631,
  playable: { id: 'm1' },
} as unknown as TitleView;

const labels = () => mocks.commands.map((command) => command.label);

const row = (label: string) => mocks.commands.find((command) => command.label === label);

function mount({ owned = true, view = VIEW, play = vi.fn() } = {}) {
  renderHook(() => useTitleCommands(view, owned, 'm1', play));
  return play;
}

beforeEach(() => {
  mocks.listed = false;
  mocks.watched = false;
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('useTitleCommands', () => {
  it('offers to play a title this server holds', () => {
    const play = mount();

    void row('content.play')?.run?.();

    expect(play).toHaveBeenCalledWith('m1');
  });

  it('offers nothing to play for a title it only knows about', () => {
    mount({ owned: false });

    expect(row('content.play')).toBeUndefined();
  });

  it('offers to add a title that is not on the list', () => {
    mount();

    expect(labels()).toContain('content.addToList');
  });

  it('offers to remove a title that is on the list', () => {
    mocks.listed = true;

    mount();

    expect(labels()).toContain('content.removeFromList');
  });

  it('toggles the list', () => {
    mount();

    void row('content.addToList')?.run?.();

    expect(mocks.toggle).toHaveBeenCalledTimes(1);
  });

  it('offers to mark an unwatched title watched', () => {
    mount();

    expect(labels()).toContain('content.markWatched');
  });

  it('offers to mark a watched title unwatched', () => {
    mocks.watched = true;

    mount();

    expect(labels()).toContain('content.markUnwatched');
  });

  it('toggles watched', () => {
    mount();

    void row('content.markWatched')?.run?.();

    expect(mocks.toggleWatched).toHaveBeenCalledTimes(1);
  });

  it('offers no list actions for a title with nothing to file it under', () => {
    const unsaved = { ...VIEW, tmdbId: null } as TitleView;

    renderHook(() => useTitleCommands(unsaved, false, null, vi.fn()));

    expect(mocks.commands).toEqual([]);
  });

  it('names the title on every row, and leaves the heading to the menu', () => {
    mount();

    expect(mocks.commands.map(({ meta, group }) => [meta, group])).toEqual([
      ['Dune', undefined],
      ['Dune', undefined],
      ['Dune', undefined],
    ]);
  });
});
