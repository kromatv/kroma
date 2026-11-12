// @vitest-environment jsdom

import { UserId } from '@kromatv/client/accounts';
import type { PlaybackSession } from '@kromatv/client/admin';
import { ItemId } from '@kromatv/client/media';
import { PlaybackSessionId } from '@kromatv/client/playback';
import { I18nProvider } from '@kromatv/ui';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NowPlayingCard } from '#web/features/admin/dashboard-now-playing';
import { WebRuntimeProvider } from '#web/shared/lib/web-runtime';
import { createWebTestRuntime } from '#web/shared/lib/web-runtime.fixture';

afterEach(cleanup);

const LONG_SHOW = 'A Remarkably Long Anthology Series Name That Runs Past Every Dashboard Column';

const session = (fields: Partial<PlaybackSession> = {}): PlaybackSession => ({
  id: PlaybackSessionId.parse('ps-1'),
  userId: UserId.parse('u-7'),
  username: 'maxime',
  itemId: ItemId.parse('it-1'),
  title: 'Pilot',
  year: 2024,
  kind: 'episode',
  showTitle: LONG_SHOW,
  season: 1,
  episode: 1,
  videoLabel: '1080p HEVC',
  audioLabel: 'EAC3 5.1',
  subtitle: '',
  bitrate: 8_000_000,
  mode: 'direct',
  player: 'KROMA Web',
  device: 'Chrome',
  network: 'LAN',
  ip: '10.0.0.2',
  state: 'playing',
  positionMs: 60_000,
  bufferedMs: null,
  durationMs: 3_000_000,
  startedAt: 0,
  ...fields,
});

function stage(s: PlaybackSession) {
  render(
    <WebRuntimeProvider value={createWebTestRuntime({})}>
      <I18nProvider locale="en">
        <NowPlayingCard s={s} onStop={() => {}} />
      </I18nProvider>
    </WebRuntimeProvider>,
  );
}

describe('a now playing card', () => {
  it('keeps the whole show name on hover when the line is cut short', () => {
    stage(session());

    expect(screen.getByTitle(LONG_SHOW).textContent).toBe(LONG_SHOW);
  });

  it('names a film by its own title when it belongs to no show', () => {
    stage(session({ kind: 'movie', title: 'Heat', showTitle: null, season: null, episode: null }));

    expect(screen.getByTitle('Heat').textContent).toBe('Heat');
  });
});
