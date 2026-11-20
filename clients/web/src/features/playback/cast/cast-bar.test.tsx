// @vitest-environment jsdom

import { DeviceId } from '@kromatv/client';
import type { CastReceiver } from '@kromatv/client/cast';
import { type Cast, I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { castSession, mediaItem, nowPlaying, receiver } from '#web/shared/lib/cast.fixture';
import { CastBar } from './cast-bar.component';

const hold = vi.hoisted((): { cast: Cast | null; poster: string | null; width: number } => ({
  cast: null,
  poster: null,
  width: 1280,
}));
const picker = vi.hoisted(() => vi.fn());

vi.mock('@kromatv/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kromatv/ui')>()),
  useCast: () => {
    if (!hold.cast) {
      throw new Error('the test gave no cast session');
    }
    return hold.cast;
  },
}));
vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-native')>()),
  useWindowDimensions: () => ({ width: hold.width, height: 800, scale: 1, fontScale: 1 }),
}));
vi.mock('#web/shared/lib/web-runtime', () => ({
  useWebRuntime: () => ({ client: { media: { artwork: { posterFor: () => hold.poster } } } }),
}));
vi.mock('#web/shared/ui/cast-picker.component', () => ({ castPicker: picker }));
vi.mock('./cast-remote.component', () => ({
  CastRemote: (props: { scrub: boolean }) => <div data-testid="remote" data-scrub={props.scrub} />,
}));

const inputHost = createInputTestHost();

function playingReceiver(item: Parameters<typeof mediaItem>[0] = {}): CastReceiver {
  return receiver({ nowPlaying: nowPlaying({ item: mediaItem(item) }) });
}

function setCast(active: CastReceiver | null, over: Partial<Cast> = {}) {
  hold.cast = castSession({
    active,
    select: vi.fn(),
    send: vi.fn(async () => null),
    ...over,
  });
  return hold.cast;
}

function show(inset?: number) {
  return inputHost.render(
    <I18nProvider locale="en">
      <CastBar inset={inset} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  inputHost.clearPressGuard();
  hold.poster = null;
  picker.mockReset();
  hold.width = 1280;
});
afterEach(cleanup);

describe('the docked bar', () => {
  it('renders nothing while this browser plays locally', () => {
    setCast(null);

    const { container } = show();

    expect(container.querySelector('aside')).toBeNull();
  });

  it('names the television being driven and stays clear of the rail', () => {
    setCast(playingReceiver());

    show(248);

    const bar = screen.getByRole('complementary', { name: 'Playing on Salon' });
    expect(bar.style.left).toBe('248px');
  });

  it('stops the television and goes back to local playback', () => {
    const cast = setCast(playingReceiver());
    show();

    fireEvent.click(screen.getByRole('button', { name: 'Stop casting' }));

    expect(cast.send).toHaveBeenCalledWith({ type: 'stop' });
    expect(cast.select).toHaveBeenCalledWith(null);
  });

  it('shows the device button with the seek line on a wide screen', () => {
    setCast(playingReceiver());

    show();

    expect(screen.getByRole('button', { name: 'Salon' })).toBeTruthy();
    expect(screen.getByTestId('remote').getAttribute('data-scrub')).toBe('true');
  });

  it('leaves the device button and the seek line out on a narrow screen', () => {
    setCast(playingReceiver());
    hold.width = 400;

    show();

    expect(screen.queryByRole('button', { name: 'Salon' })).toBeNull();
    expect(screen.getByTestId('remote').getAttribute('data-scrub')).toBe('false');
  });
});

describe('what the bar says about the title', () => {
  it('shows the poster, the metadata title and the show line', () => {
    hold.poster = '/poster.jpg';
    setCast(
      playingReceiver({
        title: 'file.mkv',
        metadata: {
          provider: 'tmdb',
          tmdbId: 1,
          title: 'Pilot',
          overview: null,
          genres: [],
          tmdbUrl: '',
        },
        showTitle: 'Severance',
        season: 1,
        episode: 1,
      }),
    );

    show();

    expect(screen.getByText('Pilot')).toBeTruthy();
    expect(screen.getByText('Severance · S1E1')).toBeTruthy();
  });

  it('falls back to the plain title when nothing is known beside it', () => {
    setCast(playingReceiver());

    show();

    expect(screen.getByText('Dune')).toBeTruthy();
  });

  it('shows no title block while nothing plays', () => {
    setCast(receiver());

    show();

    expect(screen.queryByText('Dune')).toBeNull();
  });
});

describe('what the middle of the bar says', () => {
  it('asks for the set to be switched on by hand', () => {
    setCast(receiver({ asleep: true }), {
      waking: DeviceId.parse('tv-salon-01'),
      wakingNeedsPower: true,
    });

    show();

    expect(screen.getByText(/turn it on with its remote/)).toBeTruthy();
  });

  it('says the set is turning on', () => {
    setCast(receiver({ asleep: true }), { waking: DeviceId.parse('tv-salon-01') });

    show();

    expect(screen.getByText('Turning on…')).toBeTruthy();
  });

  it('says what happens when the set is idle', () => {
    setCast(receiver());

    show();

    expect(screen.getByText(/plays on Salon/)).toBeTruthy();
  });

  it('draws the remote while a title plays', () => {
    setCast(playingReceiver());

    show();

    expect(screen.getByTestId('remote')).toBeTruthy();
  });
});

describe('the device button', () => {
  it('switches to the television picked', async () => {
    const cast = setCast(playingReceiver());
    picker.mockResolvedValue(DeviceId.parse('tv-salon-02'));
    show();

    fireEvent.click(screen.getByRole('button', { name: 'Salon' }));

    await waitFor(() => expect(cast.select).toHaveBeenCalledWith('tv-salon-02'));
    expect(picker).toHaveBeenCalledWith({ offerLocal: true });
  });

  it('keeps the television when the picker is dismissed', async () => {
    const cast = setCast(playingReceiver());
    picker.mockResolvedValue(undefined);
    show();

    fireEvent.click(screen.getByRole('button', { name: 'Salon' }));

    await waitFor(() => expect(picker).toHaveBeenCalled());
    expect(cast.select).not.toHaveBeenCalled();
  });
});
