// @vitest-environment jsdom
//
// The design half of voice search, with a fake backend standing in for the
// microphone: what the panel says, and that every transcript it is handed
// reaches the query.

import { I18nProvider } from '@kroma/ui';
import { clearPressGuard } from '@kroma/ui/kit';
import { onScreen } from '@kroma/ui/testing';
import { act, cleanup, fireEvent, render as renderRaw, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  setVoiceSearchBackend,
  type VoiceSearchBackend,
  type VoiceSessionProps,
  voiceSearchBackend,
} from '#tv/app/voiceSearch';
import { TvVoiceSearch } from '#tv/features/catalog/TvVoiceSearch';

/** Every kit control is a node of the spatial navigator, and a node needs a
 * navigator - the router gives every screen one. A test renders inside the same
 * scope so the tree it mounts is the tree the app mounts. */
const render = (ui: ReactElement) => renderRaw(onScreen(ui));

afterEach(() => {
  cleanup();
  clearPressGuard();
  setVoiceSearchBackend(null);
});

/** A backend whose "microphone" is whatever the test calls on the props. */
function fakeBackend(session: (props: VoiceSessionProps) => void = () => {}): VoiceSearchBackend {
  return {
    available: () => true,
    Session: (props: VoiceSessionProps) => {
      session(props);
      return null;
    },
  };
}

const withI18n = (ui: ReactElement) => render(<I18nProvider locale="fr">{ui}</I18nProvider>);

describe('voiceSearchBackend', () => {
  it('is null until a shell registers one', () => {
    expect(voiceSearchBackend()).toBeNull();
  });

  it('hides a backend that reports itself unavailable', () => {
    setVoiceSearchBackend({ ...fakeBackend(), available: () => false });
    expect(voiceSearchBackend()).toBeNull();
  });

  it('treats a throwing probe as no capability at all', () => {
    setVoiceSearchBackend({
      ...fakeBackend(),
      available: () => {
        throw new Error('native module blew up');
      },
    });
    expect(voiceSearchBackend()).toBeNull();
  });

  it('returns the backend once it is available', () => {
    const backend = fakeBackend();
    setVoiceSearchBackend(backend);
    expect(voiceSearchBackend()).toBe(backend);
  });
});

describe('TvVoiceSearch', () => {
  it('tells a listening user to speak', () => {
    withI18n(<TvVoiceSearch backend={fakeBackend()} onText={() => {}} onDone={() => {}} />);
    expect(screen.getByText('Parlez maintenant…')).toBeTruthy();
  });

  it('pushes every partial transcript into the query and shows it', () => {
    const onText = vi.fn();
    let heard: ((text: string) => void) | null = null;
    const backend = fakeBackend(({ onText: hear }) => {
      heard = hear;
    });
    withI18n(<TvVoiceSearch backend={backend} onText={onText} onDone={() => {}} />);

    act(() => {
      heard?.('blade');
      heard?.('blade runner');
    });

    expect(onText).toHaveBeenLastCalledWith('blade runner');
    expect(screen.getByText('blade runner')).toBeTruthy();
  });

  it('hands the session the app locale', () => {
    const seen = vi.fn();
    withI18n(<TvVoiceSearch backend={fakeBackend(seen)} onText={() => {}} onDone={() => {}} />);
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ locale: 'fr' }));
  });

  it('closes on cancel', () => {
    const onDone = vi.fn();
    withI18n(<TvVoiceSearch backend={fakeBackend()} onText={() => {}} onDone={onDone} />);
    // The panel arms the press guard as it opens (the press that opened it must
    // not fall through), so a test press has to wait it out.
    clearPressGuard();
    fireEvent.click(screen.getByText('Annuler'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
