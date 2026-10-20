// @vitest-environment jsdom
import type { MediaItem, SectionItem, Show } from '@kromatv/client/media';
import { onScreen } from '@kromatv/ui/testing';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hero, type HeroInfo } from '#tv/features/catalog/home/Hero';

afterEach(cleanup);

const info = (hero: SectionItem): HeroInfo => ({
  hero,
  heroId: hero.type === 'show' ? hero.show.id : hero.item.id,
  heroMeta: null,
  heroBackdrop: null,
  heroBadge: null,
});

const film = { id: 'm1', title: 'Big Fish' } as unknown as MediaItem;
const series = { id: 's1', title: 'Silo' } as unknown as Show;

function mount(hero: SectionItem) {
  const calls = { onPlay: vi.fn(), onSelectShow: vi.fn(), onSelectEntry: vi.fn() };
  render(onScreen(<Hero info={info(hero)} maskInset={104} {...calls} />));
  return calls;
}

describe('Hero', () => {
  it('offers a film to play and to read about', () => {
    const calls = mount({ type: 'movie', item: film });

    fireEvent.click(screen.getByLabelText('Play'));
    fireEvent.click(screen.getByLabelText('More info'));

    expect(calls.onPlay).toHaveBeenCalledWith(film);
    expect(calls.onSelectEntry).toHaveBeenCalled();
  });

  it('offers a series one way in, the page it plays from', () => {
    const calls = mount({ type: 'show', show: series });

    expect(screen.queryByLabelText('Play')).toBeNull();
    expect(screen.getAllByLabelText('More info')).toHaveLength(1);

    fireEvent.click(screen.getByLabelText('More info'));
    expect(calls.onSelectShow).toHaveBeenCalledWith(series);
  });
});
