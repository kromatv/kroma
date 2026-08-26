// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef, type ReactNode, type Ref } from 'react';
import type { View } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '#ui/services/i18n';
import { DEFAULT_SUB_APPEARANCE } from './lib/subtitle-appearance';
import type { CreditsCardItem } from './parts/credits-card';
import type { SubtitleGenBundle } from './parts/settings-panel/settings/gen';
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

interface Over {
  onClose?: (details: PlayerCloseDetails) => void;
  controller?: PlayerController;
  ref?: Ref<View>;
  onPlayNext?: () => void;
  nextTitle?: CreditsCardItem;
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
        upNext={{ nextEpisodes: [], recommendations: [] }}
        onPlayNext={over.onPlayNext}
        nextTitle={over.nextTitle}
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
