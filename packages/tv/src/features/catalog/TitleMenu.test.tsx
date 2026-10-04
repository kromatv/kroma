// @vitest-environment jsdom

import type { MediaItem, Show } from '@kromatv/client/media';
import { fakeClient } from '@kromatv/client/test';
import { clearPressGuard } from '@kromatv/ui/kit';
import { onScreen } from '@kromatv/ui/testing';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TvClientProvider, TvNavProvider } from '#tv/app/router';
import { stubScreens } from '#tv/app/router.fixtures';
import { type HeldTitle, useTitleMenu } from '#tv/features/catalog/TitleMenu';

const state = vi.hoisted(() => ({
  listed: new Set<string>(),
  seen: new Set<string>(),
  toggleList: vi.fn(),
  toggleSeen: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('#tv/app/providers/mylist', () => ({
  useMyList: () => ({ has: (id: string) => state.listed.has(id), toggle: state.toggleList }),
}));

vi.mock('#tv/app/providers/watched', () => ({
  useWatched: () => ({ has: (id: string) => state.seen.has(id), toggle: state.toggleSeen }),
}));

vi.mock('#tv/app/providers/continue', () => ({
  useContinue: () => ({ refresh: state.refresh }),
}));

const DUNE = { id: 'm1', title: 'Dune', kind: 'movie' } as unknown as MediaItem;
const SILO = { id: 's1', title: 'Silo' } as unknown as Show;
const EPISODE = { id: 'e1', title: 'Le Pacte', kind: 'episode' } as unknown as MediaItem;

afterEach(() => {
  cleanup();
  clearPressGuard();
  state.listed.clear();
  state.seen.clear();
  vi.clearAllMocks();
});

function Screen({
  title,
  onBack,
  onReady,
}: Readonly<{
  title: HeldTitle;
  onBack: (() => void) | undefined;
  onReady: (menu: ReturnType<typeof useTitleMenu>) => void;
}>) {
  const menu = useTitleMenu(onBack);
  onReady(menu);
  return (
    <>
      <button type="button" onClick={() => menu.open(title)}>
        hold
      </button>
      {menu.menu}
    </>
  );
}

function mount(title: HeldTitle, unbound = false) {
  const forget = vi.fn(async () => undefined);
  const client = fakeClient({
    playback: { forget },
    media: { artwork: { backdropFor: () => null, posterFor: () => '', showPosterFor: () => '' } },
  });
  const onBack = vi.fn();
  let menu!: ReturnType<typeof useTitleMenu>;
  render(
    onScreen(
      <TvClientProvider client={client}>
        <TvNavProvider screens={stubScreens()}>
          <Screen
            title={title}
            onBack={unbound ? undefined : onBack}
            onReady={(m) => {
              menu = m;
            }}
          />
        </TvNavProvider>
      </TvClientProvider>,
    ),
  );
  const hold = () => {
    fireEvent.click(screen.getByText('hold'));
    clearPressGuard();
  };
  return { hold, forget, onBack, menu: () => menu };
}

const rows = (name: string) =>
  within(screen.getByRole('dialog', { name }))
    .getAllByRole('button')
    .map((row) => row.textContent);

describe('the title menu', () => {
  it('offers a film its play, list, watched and report rows, named for the film', () => {
    const { hold } = mount({ kind: 'movie', item: DUNE });

    hold();

    expect(screen.getByRole('dialog', { name: 'Dune' })).toBeTruthy();
    expect(rows('Dune')).toEqual(['Play', 'Add to my list', 'Mark as watched', 'Report a problem']);
  });

  it('offers a series no play row, and the opposite of what it already is', () => {
    state.listed.add('s1');
    state.seen.add('s1');
    const { hold } = mount({ kind: 'show', item: SILO });

    hold();

    expect(rows('Silo')).toEqual(['Remove from my list', 'Mark as unwatched', 'Report a problem']);
  });

  it('toggles the list for the title it was opened on', () => {
    const { hold } = mount({ kind: 'show', item: SILO });
    hold();

    fireEvent.click(screen.getByText('Add to my list'));

    expect(state.toggleList).toHaveBeenCalledWith('s1');
  });

  it('takes a Continue watching episode off the rail, and refreshes the rail after', async () => {
    const { hold, forget } = mount({ kind: 'resume', item: EPISODE, progress: 0.4 });
    hold();

    expect(rows('Le Pacte')).toEqual(['Remove from Continue watching']);
    await act(async () => {
      fireEvent.click(screen.getByText('Remove from Continue watching'));
    });

    expect(forget).toHaveBeenCalledWith('e1');
    expect(state.refresh).toHaveBeenCalled();
  });

  it('lets Back through to the menu while it is up, and to the screen once it is not', () => {
    const { hold, onBack, menu } = mount({ kind: 'movie', item: DUNE });

    const before = menu().onBack?.();
    hold();
    const during = menu().onBack?.();

    expect(before).toBeUndefined();
    expect(during).toBe(false);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('lets Back through to the menu on a screen that binds no Back of its own', () => {
    const { hold, menu } = mount({ kind: 'movie', item: DUNE }, true);

    hold();

    expect(menu().onBack()).toBe(false);
  });
});
