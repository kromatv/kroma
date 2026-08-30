// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef, type ReactNode, type Ref } from 'react';
import type { View } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '#ui/services/i18n';
import { DEFAULT_SUB_APPEARANCE } from './lib/subtitle-appearance';
import type { CreditsCardItem } from './parts/credits-card';
import type { PostPlayItem } from './parts/post-play';
import type { SubtitleGenBundle } from './parts/settings-panel/settings/gen';
import type { UpNextData } from './parts/up-next-sheet';
import { Player } from './player';
import { fakeController } from './player.fixture';
import { type PlayerCloseDetails, type PlayerController, WEB_FLAGS } from './types';

afterEach(cleanup);

const NO_GEN: SubtitleGenBundle = {
  canCreate: false,
  caps: null,
  pending: [],
  onCancel: () => {},
  onDelete: () => {},
  onStart: () => {},
};

const media = (
  <Player.Media key="media">
    <video data-testid="surface">
      <track kind="captions" />
    </video>
  </Player.Media>
);

const NO_UP_NEXT: UpNextData = { nextEpisodes: [], recommendations: [] };

interface Over {
  onClose?: (details: PlayerCloseDetails) => void;
  controller?: PlayerController;
  ref?: Ref<View>;
  onPlayNext?: () => void;
  nextTitle?: CreditsCardItem;
  upNext?: UpNextData;
  postPlay?: PostPlayItem;
  onGoHome?: () => void;
  onPlayItem?: (item: { id: string }) => void;
}

function player(children: ReactNode, over: Over = {}) {
  return (
    <I18nProvider locale="en">
      <Player.Root
        ref={over.ref}
        controller={over.controller ?? fakeController()}
        flags={WEB_FLAGS}
        title="Blade Runner 2049"
        tileAt={() => null}
        appearance={DEFAULT_SUB_APPEARANCE}
        onAppearanceChange={() => {}}
        subtitleGen={NO_GEN}
        upNext={over.upNext ?? NO_UP_NEXT}
        onPlayNext={over.onPlayNext}
        nextTitle={over.nextTitle}
        postPlay={over.postPlay}
        onGoHome={over.onGoHome}
        onPlayItem={over.onPlayItem}
        onClose={over.onClose ?? (() => {})}
      >
        {children}
      </Player.Root>
    </I18nProvider>
  );
}

describe('<Player> as a compound', () => {
  it('is a namespace object whose bare name renders nothing', () => {
    expect(typeof Player).toBe('object');
    expect(Object.keys(Player).sort()).toEqual(['Actions', 'Media', 'Panel', 'Root']);
  });

  it('mounts the media inside the stage, which is what sizes a browser surface', () => {
    render(player(media));
    const surface = screen.getByTestId('surface');
    expect(surface.closest('#kroma-player-stage')).not.toBeNull();
  });

  it('draws <Player.Actions> in the top bar', () => {
    render(
      player([
        media,
        <Player.Actions key="actions">
          <button type="button">Play on TV</button>
        </Player.Actions>,
      ]),
    );
    expect(screen.getByText('Play on TV')).toBeTruthy();
  });

  it('gives the two sliders of the chrome a name and the value they hold', () => {
    render(player(media));
    const seek = screen.getByLabelText('Seek bar');
    expect(seek.getAttribute('role')).toBe('slider');
    expect(seek.getAttribute('aria-valuenow')).toBe('164');
    expect(seek.getAttribute('aria-valuemax')).toBe('9840');

    const volume = screen.getByLabelText('Volume');
    expect(volume.getAttribute('aria-valuenow')).toBe('70');
    expect(volume.getAttribute('aria-valuetext')).toBe('70%');
  });

  it('draws a child that is no part of its own over the chrome', () => {
    render(player([media, <div key="toast">Resume at 12:04</div>]));
    expect(screen.getByText('Resume at 12:04')).toBeTruthy();
  });

  it('hands its own root node to `ref`, which is what the web client puts into fullscreen', () => {
    const ref = createRef<View>();
    render(player(media, { ref }));
    expect(ref.current).toBeTruthy();
  });

  it('refuses a part used outside the Root', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Player.Media>{null}</Player.Media>)).toThrow('<Player.Media>');
    quiet.mockRestore();
  });
});

describe('<Player> with a title that will not play', () => {
  const loading = { ...fakeController(), waiting: true, ready: false };
  const REASON = 'This video is too big for this device';

  it('prints the reason across the picture instead of spinning at it', () => {
    render(
      player(media, {
        controller: { ...loading, error: REASON, errorHint: 'Try it on another one.' },
      }),
    );

    expect(screen.getByText(REASON)).toBeTruthy();
    expect(screen.getByText('Try it on another one.')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('still spins for a title that is merely slow to arrive', () => {
    render(player(media, { controller: loading }));

    expect(screen.getByRole('progressbar')).toBeTruthy();
  });
});

describe('<Player.Root> says why it was closed', () => {
  it('reports the chrome`s own back control as `close`', () => {
    const onClose = vi.fn();
    render(player(media, { onClose }));
    fireEvent.click(screen.getByLabelText('Back'));
    expect(onClose).toHaveBeenCalledWith({ reason: 'close' });
  });

  it('reports the remote`s Back button, which a browser shell sends as Escape, as `back`', () => {
    const onClose = vi.fn();
    render(player(media, { onClose }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledWith({ reason: 'back' });
  });
});

const OFFER: PostPlayItem = {
  id: 'br',
  title: 'Blade Runner',
  subtitle: '1982 · 1h57',
  overview: 'A blade runner hunts four replicants.',
};

describe('<Player.Root> when the film is over', () => {
  it('names the film that just finished, so the screen says where the viewer is', () => {
    const { rerender } = render(player(media, { postPlay: OFFER }));

    rerender(player(media, { postPlay: OFFER, controller: fakeController({ endedNonce: 1 }) }));

    expect(screen.getByText('You finished Blade Runner 2049')).toBeTruthy();
  });

  it('offers the next film instead of leaving', () => {
    const onClose = vi.fn();
    const { rerender } = render(player(media, { onClose, postPlay: OFFER }));
    expect(screen.queryByText('Blade Runner')).toBeNull();

    rerender(
      player(media, { onClose, postPlay: OFFER, controller: fakeController({ endedNonce: 1 }) }),
    );

    expect(screen.getByText('Blade Runner')).toBeTruthy();
    expect(screen.getByText('A blade runner hunts four replicants.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('takes the up-next peek off the stage: the end screen is the whole screen', () => {
    const upNext = {
      nextEpisodes: [],
      recommendations: [{ id: 'mm', title: 'Memories of Murder' }],
    };
    const { rerender } = render(player(media, { postPlay: OFFER, upNext }));
    expect(screen.getByText('Memories of Murder')).toBeTruthy();

    rerender(
      player(media, { postPlay: OFFER, upNext, controller: fakeController({ endedNonce: 1 }) }),
    );

    expect(screen.queryByText('Memories of Murder')).toBeNull();
    expect(screen.getByText('Blade Runner')).toBeTruthy();
  });

  it('plays the offered film on OK, which opens on the play button', () => {
    const onPlayItem = vi.fn();
    const { rerender } = render(player(media, { postPlay: OFFER, onPlayItem }));
    rerender(
      player(media, { postPlay: OFFER, onPlayItem, controller: fakeController({ endedNonce: 1 }) }),
    );

    fireEvent.keyDown(window, { key: 'Enter' });

    expect(onPlayItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'br' }));
  });

  it('reaches home with one press to the right, and Back goes there too', () => {
    const onGoHome = vi.fn();
    const onPlayItem = vi.fn();
    const props = { postPlay: OFFER, onGoHome, onPlayItem };
    const { rerender } = render(player(media, props));
    rerender(player(media, { ...props, controller: fakeController({ endedNonce: 1 }) }));

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onGoHome).toHaveBeenCalledTimes(1);
    expect(onPlayItem).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onGoHome).toHaveBeenCalledTimes(2);
  });

  it('leaves as `ended` when there is no film to offer', () => {
    const onClose = vi.fn();
    const { rerender } = render(player(media, { onClose }));

    rerender(player(media, { onClose, controller: fakeController({ endedNonce: 1 }) }));

    expect(onClose).toHaveBeenCalledWith({ reason: 'ended' });
  });
});

describe('<Player.Root> and the overlays it owns', () => {
  it('raises the stats overlay from the settings menu, and leaves it up when the panel goes', async () => {
    render(player(media));
    fireEvent.click(screen.getByLabelText('Settings'));
    fireEvent.click(screen.getByLabelText('Statistics'));
    // The headline the fixture controller reports, so the overlay is the panel's
    // own rather than the settings row that flipped it on.
    expect(screen.getByText('Direct · HEVC passthrough')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByLabelText('Statistics')).toBeNull());
    expect(screen.getByText('Direct · HEVC passthrough')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Close'));
    expect(screen.queryByText('Direct · HEVC passthrough')).toBeNull();
  });

  it('plays the next title from the credits card', () => {
    const onPlayNext = vi.fn();
    render(
      player(media, {
        // Inside the last 30s, which is where the card comes up unmarked.
        controller: fakeController({ cur: 9835 }),
        onPlayNext,
        nextTitle: { title: 'Blade Runner', subtitle: 'S1 E2' },
      }),
    );
    fireEvent.click(screen.getByLabelText('Play now'));
    expect(onPlayNext).toHaveBeenCalledTimes(1);
  });
});

describe('<Player.Panel>, which takes the stage over', () => {
  it('locks the chrome: OK leaves instead of playing', () => {
    const onClose = vi.fn();
    const controller = fakeController();
    const togglePlay = vi.spyOn(controller, 'togglePlay');
    render(
      player([media, <Player.Panel key="stopped">An admin stopped this</Player.Panel>], {
        controller,
        onClose,
      }),
    );
    expect(screen.getByText('An admin stopped this')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(togglePlay).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith({ reason: 'back' });
  });

  it('leaves OK on the transport alone while no panel is mounted', () => {
    const onClose = vi.fn();
    const controller = fakeController();
    const togglePlay = vi.spyOn(controller, 'togglePlay');
    render(player(media, { controller, onClose }));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(togglePlay).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
