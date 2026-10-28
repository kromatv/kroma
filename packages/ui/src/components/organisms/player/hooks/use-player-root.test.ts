// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { describe, expect, it, vi } from 'vitest';
import type { UpNextItem } from '../parts/up-next-sheet';
import { fakeController } from '../player.fixture';
import { Credits, Resume, UpNext } from '../player-parts';
import { type PlayerController, WEB_FLAGS } from '../types';
import { usePlayerRoot } from './use-player-root';

const layout = (width: number, height: number) =>
  ({ nativeEvent: { layout: { width, height } } }) as LayoutChangeEvent;

const EMPTY_DATA = { nextEpisodes: [], recommendations: [] };

function root(over: Partial<PlayerController> = {}, children?: ReactNode) {
  const controller = fakeController({
    seekTo: vi.fn(),
    setVolume: vi.fn(),
    ...over,
  });
  const onClose = vi.fn();
  const view = renderHook(() => usePlayerRoot({ controller, flags: WEB_FLAGS, onClose, children }));
  return { ...view, controller, onClose };
}

describe('usePlayerRoot', () => {
  it('hands out inert defaults when no slot supplies them', () => {
    const { result } = root();

    expect(result.current.tileAt(0)).toBeNull();
    expect(result.current.onAppearanceChange({})).toBeUndefined();
    expect(result.current.subtitleGen.canCreate).toBe(false);
    expect(result.current.subtitleGen.onCancel('a')).toBeUndefined();
    expect(result.current.subtitleGen.onDelete('a')).toBeUndefined();
    expect(result.current.subtitleGen.onStart({} as never)).toBeUndefined();
  });

  it('takes the sheet and credits data from their slots', () => {
    const onPlay = vi.fn();
    const slots = [
      createElement(UpNext, { key: 'u', data: EMPTY_DATA }),
      createElement(Credits, { key: 'c', onPlay }),
    ];

    const { result } = root({}, slots);

    expect(result.current.upNext).toBe(EMPTY_DATA);
    expect(result.current.onPlayNext).toBe(onPlay);
  });

  it('tracks the stage size from layout events and ignores empty ones', () => {
    const { result } = root();

    act(() => result.current.onStageLayout(layout(1280.4, 720.2)));
    act(() => result.current.onStageLayout(layout(0, 0)));

    expect(result.current.stageSize).toEqual({ width: 1280, height: 720 });
  });

  it('keeps the previous transport height when the measurement is zero', () => {
    const { result } = root();

    act(() => result.current.onTransportLayout(layout(800, 96.4)));
    act(() => result.current.onTransportLayout(layout(800, 0)));
    const lifted = result.current.introLift;

    expect(lifted).toBeGreaterThan(0);
  });

  it('starts over from the beginning when the resume prompt is declined', () => {
    const { result, controller } = root(
      { playing: true, waiting: false, cur: 600 },
      createElement(Resume, { at: 600 }),
    );

    act(() => result.current.startOver());

    expect(controller.seekTo).toHaveBeenCalledWith(0);
    expect(result.current.notice.shown).toBe(false);
  });

  it('moves the volume a step and flashes it when the volume control takes Up', () => {
    const { result, controller } = root({ volume: 0.5, volumeMax: 1 });

    act(() => result.current.volumeNudge(1));

    expect(controller.setVolume).toHaveBeenCalledWith(0.55);
    expect(result.current.flash).toMatchObject({ kind: 'volume' });
  });

  it('plays the next episode when the next control is activated', () => {
    const onPlay = vi.fn();
    const { result } = root({}, createElement(Credits, { onPlay }));

    act(() => result.current.nav.activate('next'));

    expect(onPlay).toHaveBeenCalledOnce();
  });

  it('opens the sheet overlay', () => {
    const { result } = root();

    act(() => result.current.openSheet());

    expect(result.current.nav.overlay).toBe('sheet');
  });

  it('closes the overlay before running an overflow control', () => {
    const { result, controller } = root({ togglePip: vi.fn() });

    act(() => result.current.openSheet());
    act(() => result.current.runOverflow('pip'));

    expect(result.current.nav.overlay).toBeNull();
    expect(controller.togglePip).toHaveBeenCalledOnce();
  });

  it('plays a sheet item through the up-next slot', () => {
    const onPlay = vi.fn();
    const item = { id: 'e2' } as unknown as UpNextItem;
    const { result } = root({}, createElement(UpNext, { data: EMPTY_DATA, onPlay }));

    act(() => result.current.playUpNextItem(item));

    expect(onPlay).toHaveBeenCalledWith(item);
  });
});
