// @vitest-environment jsdom
import type { MediaItem, Show } from '@kromatv/client/media';
import { Focusable } from '@kromatv/ui/kit';
import { onScreen, wearsRing } from '@kromatv/ui/testing';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AccessibilityInfo } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hero } from '#tv/features/catalog/home/Hero';
import type { HeroSlide } from '#tv/features/catalog/home/hero-slides';
import { HERO_DWELL_MS } from '#tv/features/catalog/home/use-hero-pager';

const reducedMotion = (on: boolean) =>
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(on);

beforeEach(() => {
  reducedMotion(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const film = (title: string, note: string | null = null): HeroSlide => ({
  entry: { type: 'movie', item: { id: `m:${title}`, title } as unknown as MediaItem },
  backdrop: `art:${title}`,
  badge: null,
  note,
});

const series = (title: string): HeroSlide => ({
  entry: { type: 'show', show: { id: `s:${title}`, title } as unknown as Show },
  backdrop: `art:${title}`,
  badge: null,
  note: null,
});

function mount(slides: HeroSlide[]) {
  const calls = { onPlay: vi.fn(), onSelectEntry: vi.fn() };
  render(
    onScreen(
      <>
        <Hero slides={slides} maskInset={104} {...calls} />
        <Focusable label="First row" />
      </>,
      { remote: true },
    ),
  );
  return calls;
}

async function press(key: string) {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

const waits = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

const shown = (title: string) => screen.queryByText(title) !== null;

describe('Hero', () => {
  it('offers a film to play and to read about', () => {
    const big = film('Big Fish');
    const calls = mount([big]);

    fireEvent.click(screen.getByLabelText('Play'));
    fireEvent.click(screen.getByLabelText('More info'));

    expect(calls.onPlay).toHaveBeenCalledWith(big.entry.type === 'movie' && big.entry.item);
    expect(calls.onSelectEntry).toHaveBeenCalledWith(big.entry);
  });

  it('offers a series one way in, the page it plays from', () => {
    const silo = series('Silo');
    const calls = mount([silo]);

    fireEvent.click(screen.getByLabelText('More info'));

    expect(screen.queryByLabelText('Play')).toBeNull();
    expect(calls.onSelectEntry).toHaveBeenCalledWith(silo.entry);
  });

  it('says why an entry is there where the server gave a reason', () => {
    mount([film('Big Fish', 'For you · Fantasy')]);

    expect(screen.getByText('For you · Fantasy')).toBeTruthy();
    expect(screen.queryByText('Featured')).toBeNull();
  });

  it('calls an entry featured when the server gave no reason', () => {
    mount([film('Big Fish')]);

    expect(screen.getByText('Featured')).toBeTruthy();
  });

  it('draws no pager dots under a single entry', () => {
    mount([film('Big Fish')]);

    expect(screen.queryByRole('img', { name: /of/ })).toBeNull();
  });

  it('says which entry is shown out of how many', () => {
    mount([film('Big Fish'), series('Silo'), film('Dune')]);

    expect(screen.getByRole('img', { name: '1 of 3' }).children).toHaveLength(3);
  });

  it('is a spacer while there is nothing to feature', () => {
    mount([]);

    expect(screen.queryByLabelText('More info')).toBeNull();
  });
});

describe('paging the hero with the remote', () => {
  it('goes to the next entry on Right from its last button', async () => {
    mount([film('Big Fish'), series('Silo')]);

    await press('ArrowRight');
    const stillOnTheFilm = shown('Big Fish');
    await press('ArrowRight');

    expect(stillOnTheFilm).toBe(true);
    expect(shown('Silo')).toBe(true);
    expect(screen.getByRole('img', { name: '2 of 2' })).toBeTruthy();
  });

  it('goes to the previous entry on Left from its first button, round to the last', async () => {
    mount([film('Big Fish'), series('Silo'), film('Dune')]);

    await press('ArrowLeft');

    expect(shown('Dune')).toBe(true);
  });

  it('keeps the focus on the primary button across a slide change', async () => {
    mount([film('Big Fish'), series('Silo')]);

    await press('ArrowRight');
    await press('ArrowRight');

    expect(wearsRing(screen.getByLabelText('More info'))).toBe(true);
  });

  it('leaves Left and Right to the navigator when there is one entry', async () => {
    mount([film('Big Fish')]);

    await press('ArrowRight');
    await press('ArrowRight');

    expect(wearsRing(screen.getByLabelText('More info'))).toBe(true);
  });
});

describe('the hero slideshow', () => {
  it('moves to the next entry by itself after a dwell with no press', async () => {
    vi.useFakeTimers();
    mount([film('Big Fish'), series('Silo')]);

    await waits(HERO_DWELL_MS - 1);
    const early = shown('Silo');
    await waits(1);

    expect(early).toBe(false);
    expect(shown('Silo')).toBe(true);
  });

  it('comes back round to the first entry after the last', async () => {
    vi.useFakeTimers();
    mount([film('Big Fish'), series('Silo')]);

    await waits(HERO_DWELL_MS);
    await waits(HERO_DWELL_MS);

    expect(shown('Big Fish')).toBe(true);
  });

  it('starts the dwell over when a button is pressed', async () => {
    vi.useFakeTimers();
    mount([film('Big Fish'), series('Silo')]);

    await waits(HERO_DWELL_MS - 1);
    await press('ArrowRight');
    await waits(HERO_DWELL_MS - 1);

    expect(shown('Big Fish')).toBe(true);
  });

  it('stops for good once the viewer pages by hand', async () => {
    vi.useFakeTimers();
    mount([film('Big Fish'), series('Silo'), film('Dune')]);

    await press('ArrowLeft');
    await waits(HERO_DWELL_MS * 3);

    expect(shown('Dune')).toBe(true);
  });

  it('holds still while the focus is on a row below', async () => {
    vi.useFakeTimers();
    mount([film('Big Fish'), series('Silo')]);

    await press('ArrowDown');
    await waits(HERO_DWELL_MS * 2);

    expect(wearsRing(screen.getByLabelText('First row'))).toBe(true);
    expect(shown('Big Fish')).toBe(true);
  });

  it('holds still for a viewer who asked for less motion', async () => {
    vi.useFakeTimers();
    reducedMotion(true);
    mount([film('Big Fish'), series('Silo')]);
    await waits(0);

    await waits(HERO_DWELL_MS * 2);

    expect(shown('Big Fish')).toBe(true);
  });
});
