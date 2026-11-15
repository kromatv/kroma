// @vitest-environment jsdom

import type { CardSection, SectionItem, Show } from '@kromatv/client/media';
import { fakeClient } from '@kromatv/client/test';
import { act, cleanup, render } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LauncherProvider } from '#tv/app/launcher';
import { RecommendProvider, useRecommend } from '#tv/app/providers/recommend';

const session = vi.hoisted(() => ({ client: null as unknown, user: { id: 'u1' } }));

vi.mock('#tv/app/providers/auth', () => ({
  useAuth: () => ({ user: session.user, ready: true }),
}));
vi.mock('#tv/app/providers/connection', () => ({
  useConnection: () => ({ client: session.client }),
}));

const SILO: SectionItem = { type: 'show', show: { id: 's1', title: 'Silo' } as unknown as Show };

const section = (id: string, layout: CardSection['layout']): CardSection => ({
  id,
  title: id,
  layout,
  notes: {},
  items: [SILO],
});

let seen: ReturnType<typeof useRecommend>;

function Capture() {
  const current = useRecommend();
  useEffect(() => {
    seen = current;
  });
  return null;
}

async function boot(
  home: CardSection[],
  pick: () => Promise<SectionItem | null> = async () => null,
) {
  const asked = { homeCards: vi.fn(async () => home), featured: vi.fn(pick) };
  session.client = fakeClient({ media: { ...asked, artwork: { backdropFor: () => null } } });
  const launcher = { setContinueWatching: vi.fn(), setHomeChannel: vi.fn() };
  render(
    <LauncherProvider value={launcher}>
      <RecommendProvider>
        <Capture />
      </RecommendProvider>
    </LauncherProvider>,
  );
  await act(async () => {
    await new Promise<void>((settle) => setTimeout(settle, 0));
  });
  return { ...asked, launcher };
}

afterEach(cleanup);

describe('RecommendProvider', () => {
  it('asks for the home as cards, naming every layout the television draws', async () => {
    const home = [section('hero', 'hero'), section('trending', 'ranked')];

    const { homeCards } = await boot(home);

    expect(homeCards).toHaveBeenCalledWith({ layouts: ['hero', 'spotlight', 'ranked', 'wide'] });
    expect(seen.sections).toEqual(home);
  });

  it('spends no request on a featured title when the home opens on a hero', async () => {
    const { featured } = await boot([section('hero', 'hero')]);

    expect(featured).not.toHaveBeenCalled();
    expect(seen.featured).toBeNull();
  });

  it('asks a server whose home carries no hero for its featured title', async () => {
    const { featured } = await boot([section('recent', 'rail')], async () => SILO);

    expect(featured).toHaveBeenCalledTimes(1);
    expect(seen.featured).toEqual(SILO);
  });

  it('keeps the home it was given when the featured title cannot be fetched', async () => {
    const home = [section('recent', 'rail')];

    const { featured } = await boot(home, async () => {
      throw new Error('offline');
    });

    expect(featured).toHaveBeenCalledTimes(1);
    expect(seen.sections).toEqual(home);
    expect(seen.featured).toBeNull();
  });

  it('mirrors the generic rows to the launcher from card sections', async () => {
    const dune = { id: 'm1', title: 'Dune', year: 2021, addedAt: '2026-01-01' };
    const recent = {
      ...section('recent', 'rail'),
      title: 'New movies',
      items: [{ type: 'movie', item: dune }],
    } as unknown as CardSection;

    const { launcher } = await boot([section('hero', 'hero'), recent]);

    const published = JSON.parse(launcher.setHomeChannel.mock.calls[0]?.[0] as string);
    expect(published).toEqual([
      { title: 'New movies', items: [expect.objectContaining({ id: 'm1', subtitle: '2021' })] },
    ]);
  });
});
