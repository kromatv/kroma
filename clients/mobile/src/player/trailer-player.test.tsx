// @vitest-environment jsdom

import type { Trailer } from '@kromatv/client/trailers';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Linking } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  preparation: 'preparing' as 'preparing' | 'ready' | 'failed',
  uri: undefined as string | null | undefined,
  clip: { failed: false, endedNonce: 0, shutdown: vi.fn(), player: {} },
}));

vi.mock('expo-router', () => ({ usePreventRemove: () => undefined }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('#mobile/lib/i18n', () => ({
  useT: () => (key: string) =>
    ({
      'trailer.watch': 'Bande-annonce',
      'trailer.preparing': 'Préparation de la bande-annonce…',
      'trailer.failed': 'Cette bande-annonce ne peut pas être lue pour le moment.',
      'trailer.openOnYoutube': 'Voir sur YouTube',
      'player.back': 'Retour',
    })[key] ?? key,
}));
vi.mock('#mobile/lib/session', () => ({
  useClient: () => ({
    trailers: {
      prepare: vi.fn(),
      streamUrl: (kind: string, tmdbId: number, video: string) =>
        `stream://${kind}/${tmdbId}/${video}`,
    },
  }),
}));
vi.mock('@kromatv/core/react', () => ({ useTrailerPreparation: () => state.preparation }));
vi.mock('#mobile/player/clip/use-clip-engine', () => ({
  useClipEngine: (uri: string | null) => {
    state.uri = uri;
    return state.clip;
  },
}));
vi.mock('#mobile/player/use-player-presentation', () => ({
  usePlayerPresentation: () => ({ fullscreen: false, collapse: vi.fn(), toggle: vi.fn() }),
}));
vi.mock('#mobile/player/video-surface', () => ({
  VideoSurface: ({ children }: { children(pip: unknown): ReactNode }) =>
    children({ inPip: false, startPip: () => undefined }),
}));
vi.mock('#mobile/player/clip/clip-chrome', () => ({
  ClipChrome: ({ notice }: { notice?: string | null }) => <span>{notice ?? 'Chrome'}</span>,
}));
vi.mock('#mobile/player/portrait-playback-strip', () => ({ PortraitPlaybackStrip: () => null }));

const { TrailerPlayer } = await import('./trailer-player');

const TRAILER: Trailer = {
  video: 'Ox8ZLF6cGM0',
  name: 'Official Trailer',
  language: 'fr',
  version: 'localized',
  kind: 'trailer',
  official: true,
};

function renderTrailer(onClose = vi.fn()) {
  render(
    <TrailerPlayer
      kind="movie"
      tmdbId={1061474}
      trailer={TRAILER}
      title="Superman"
      onClose={onClose}
    />,
  );
  return onClose;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.preparation = 'preparing';
  state.uri = undefined;
  state.clip.failed = false;
  state.clip.endedNonce = 0;
});

describe('a trailer the server is still fetching', () => {
  it('holds the chrome in its loading state with nothing to play', () => {
    renderTrailer();

    expect(screen.getByText('Préparation de la bande-annonce…')).toBeTruthy();
    expect(state.uri).toBeNull();
  });
});

describe('a trailer the server has ready', () => {
  it('plays the stream the server prepared', () => {
    state.preparation = 'ready';

    renderTrailer();

    expect(state.uri).toBe('stream://movie/1061474/Ox8ZLF6cGM0');
    expect(screen.getByText('Chrome')).toBeTruthy();
  });

  it('closes the player once the trailer has played to its end', () => {
    state.preparation = 'ready';
    state.clip.endedNonce = 1;

    const onClose = renderTrailer();

    expect(state.clip.shutdown).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('a trailer that cannot be played', () => {
  it('offers the trailer on YouTube when the server could not fetch it', () => {
    state.preparation = 'failed';
    const openURL = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    renderTrailer();

    fireEvent.click(screen.getByRole('button', { name: 'Voir sur YouTube' }));

    expect(openURL).toHaveBeenCalledWith('https://www.youtube.com/watch?v=Ox8ZLF6cGM0');
  });

  it('offers YouTube too when the fetched file will not play', () => {
    state.preparation = 'ready';
    state.clip.failed = true;

    renderTrailer();

    expect(
      screen.getByText('Cette bande-annonce ne peut pas être lue pour le moment.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Voir sur YouTube' })).toBeTruthy();
  });

  it('goes back and stops the player', () => {
    state.preparation = 'failed';
    const onClose = renderTrailer();

    fireEvent.click(screen.getAllByRole('button', { name: 'Retour' })[0]);

    expect(state.clip.shutdown).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
