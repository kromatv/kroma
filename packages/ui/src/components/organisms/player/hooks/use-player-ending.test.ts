// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePlayerEnding } from './use-player-ending.hook';

interface Playhead {
  cur: number;
  dur: number;
  playing: boolean;
  endedNonce: number;
}

const OFFER = { id: 'next', title: 'Next film' };

function mount(start: Playhead) {
  return renderHook(
    (playhead: Playhead) =>
      usePlayerEnding({
        controller: { seekPreview: null, ...playhead },
        postPlay: OFFER,
        onLeave: vi.fn(),
        onClearOverlay: vi.fn(),
      }),
    { initialProps: start },
  );
}

const RUNNING: Playhead = { cur: 99, dur: 100, playing: true, endedNonce: 0 };
const ENDED: Playhead = { cur: 100, dur: 100, playing: false, endedNonce: 1 };

describe('the end screen', () => {
  it('rises when the film ends with a film to offer', () => {
    const { result, rerender } = mount(RUNNING);

    rerender(ENDED);

    expect(result.current.over).toBe(true);
  });

  it('stays while the film sits at its end', () => {
    const { result, rerender } = mount(RUNNING);
    rerender(ENDED);

    rerender({ ...ENDED, playing: true });

    expect(result.current.over).toBe(true);
  });

  it('falls when the film plays again from before its end', () => {
    const { result, rerender } = mount(RUNNING);
    rerender(ENDED);

    rerender({ ...ENDED, cur: 0, playing: true });

    expect(result.current.over).toBe(false);
  });

  it('rises again when the restarted film ends again', () => {
    const { result, rerender } = mount(RUNNING);
    rerender(ENDED);
    rerender({ ...ENDED, cur: 0, playing: true });

    rerender({ ...ENDED, endedNonce: 2 });

    expect(result.current.over).toBe(true);
  });
});
