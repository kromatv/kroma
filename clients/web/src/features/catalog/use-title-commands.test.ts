// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetCommands, listedCommands } from '#web/shared/lib/command-menu.fixture';
import type { TitleView } from '#web/shared/lib/titleView';
import { useTitleCommands } from './use-title-commands';

vi.mock('@kromatv/ui', () => ({ useT: () => (key: string) => key }));
vi.mock('#web/shared/lib/mylist', () => ({
  useMyList: () => ({ inList: () => false, toggle: vi.fn() }),
}));
vi.mock('#web/shared/lib/watched', () => ({
  useWatched: () => ({ isWatched: () => false, toggleWatched: vi.fn() }),
}));
vi.mock('#web/shared/lib/command-menu', async () => ({
  useCommands: (await import('#web/shared/lib/command-menu.fixture')).useFakeCommands,
}));

const VIEW = {
  kind: 'movie',
  title: 'Dune',
  localId: 'm1',
  tmdbId: 438631,
  playable: { id: 'm1' },
} as unknown as TitleView;

const labels = () => listedCommands().map((command) => command.label);

function mount(view = VIEW, play = vi.fn()) {
  renderHook(() => useTitleCommands(view, play));
  return play;
}

afterEach(() => {
  cleanup();
  forgetCommands();
});

describe('useTitleCommands', () => {
  it('offers to play a title this server holds', () => {
    const play = mount();

    void listedCommands()
      .find((command) => command.label === 'content.play')
      ?.run?.();

    expect(play).toHaveBeenCalledWith('m1');
  });

  it('offers nothing to play for a title it only knows about', () => {
    mount({ ...VIEW, localId: null } as TitleView);

    expect(labels()).not.toContain('content.play');
  });

  it('offers to file and mark a title it only knows about', () => {
    mount({ ...VIEW, localId: null } as TitleView);

    expect(labels()).toEqual(['content.addToList', 'content.markWatched']);
  });

  it('offers nothing for a title with nothing to file it under', () => {
    mount({ ...VIEW, localId: null, tmdbId: null, playable: null } as unknown as TitleView);

    expect(listedCommands()).toEqual([]);
  });

  it('names the title on every row, and leaves the heading to the menu', () => {
    mount();

    expect(listedCommands().map(({ meta, group }) => [meta, group])).toEqual([
      ['Dune', undefined],
      ['Dune', undefined],
      ['Dune', undefined],
    ]);
  });
});
