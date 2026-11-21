// @vitest-environment jsdom

import type { CastNowPlaying } from '@kromatv/client/cast';
import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mediaItem, nowPlaying } from '#web/shared/lib/cast.fixture';
import { CastRemote } from './cast-remote.component';

vi.mock('#web/shared/lib/use-storyboard.hook', () => ({
  useStoryboard: () => ({ tile: () => null }),
}));

vi.mock('@kromatv/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kromatv/ui')>()),
  SeekBar: (props: {
    bufEnd: number | null;
    tileAt: (sec: number) => unknown;
    onScrub: (sec: number) => void;
    onNudge: (dir: 1 | -1) => void;
    onActivate: () => void;
    onFocus: () => void;
    onBlur: () => void;
  }) => {
    props.tileAt(5);
    props.onActivate();
    props.onFocus();
    props.onBlur();
    return (
      <div data-testid="seek" data-buffered={String(props.bufEnd)}>
        <button type="button" onClick={() => props.onScrub(120)}>
          scrub
        </button>
        <button type="button" onClick={() => props.onNudge(1)}>
          nudge
        </button>
      </div>
    );
  },
}));

const inputHost = createInputTestHost();

function mount(now: CastNowPlaying, view: { scrub: boolean }) {
  const send = vi.fn(async () => null);
  inputHost.render(
    <I18nProvider locale="en">
      <CastRemote playing={now} send={send} scrub={view.scrub} />
    </I18nProvider>,
  );
  return send;
}

const show = (now: CastNowPlaying) => mount(now, { scrub: true });
const showCramped = (now: CastNowPlaying) => mount(now, { scrub: false });

beforeEach(() => inputHost.clearPressGuard());
afterEach(cleanup);

describe('the docked remote keys', () => {
  it('offers Pause while the film plays and sends a toggle', () => {
    const send = show(nowPlaying());

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'togglePlay' });
  });

  it('still offers Pause while the film buffers', () => {
    show(nowPlaying({ state: 'buffering' }));

    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  });

  it('offers Play while the film is paused', () => {
    show(nowPlaying({ state: 'paused' }));

    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  it('has no next-episode key for a film', () => {
    show(nowPlaying());

    expect(screen.queryByRole('button', { name: 'Next episode' })).toBeNull();
  });

  it('skips to the next episode of a show', () => {
    const send = show(nowPlaying({ item: mediaItem({ kind: 'episode' }) }));

    fireEvent.click(screen.getByRole('button', { name: 'Next episode' }));

    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'skipNext' });
  });

  it.each(['Back 10 s', 'Forward 10 s'])('seeks from the %s key', async (name) => {
    const send = show(nowPlaying());

    fireEvent.click(screen.getByRole('button', { name }));

    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'seek' })),
    );
  });
});

describe('the docked remote seek line', () => {
  it('prints the playhead and the runtime', () => {
    show(nowPlaying());

    expect(screen.getByText('0:00')).toBeTruthy();
    expect(screen.getByText('10:00')).toBeTruthy();
  });

  it('prints dashes when the runtime is unknown', () => {
    show(nowPlaying({ durationMs: null }));

    expect(screen.getByText('--:--')).toBeTruthy();
  });

  it('is left out when there is no room for it', () => {
    showCramped(nowPlaying());

    expect(screen.queryByTestId('seek')).toBeNull();
  });

  it('prints the scrub preview instead of the playhead', () => {
    show(nowPlaying());

    fireEvent.click(screen.getByText('scrub'));

    expect(screen.getByText('2:00')).toBeTruthy();
  });

  it('hands the buffered edge to the bar in seconds', () => {
    show(nowPlaying({ bufferedMs: 90_000 }));

    expect(screen.getByTestId('seek').getAttribute('data-buffered')).toBe('90');
  });

  it('hands no buffered edge when the television reports none', () => {
    show(nowPlaying());

    expect(screen.getByTestId('seek').getAttribute('data-buffered')).toBe('null');
  });

  it('nudges the playhead from the bar', async () => {
    const send = show(nowPlaying());

    fireEvent.click(screen.getByText('nudge'));

    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'seek' })),
    );
  });
});
