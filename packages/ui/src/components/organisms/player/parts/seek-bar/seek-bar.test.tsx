// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Focusable } from '#ui/components/atoms/focusable';
import { onScreen } from '#ui/testing';
import { SeekBar, type SeekBarProps } from './seek-bar';

afterEach(cleanup);

// The one face this pins: an engine's forward buffer, drawn between the
// playhead and where it reaches. It is a percentage inset, so it survives the
// track being laid out at any width, which is what a jsdom render never gives.
function draw(over: Partial<SeekBarProps> = {}, remote = false) {
  return render(
    onScreen(
      <>
        {remote ? <Focusable label="Above" autoFocus onPress={() => {}} /> : null}
        <SeekBar
          cur={0}
          dur={100}
          bufEnd={null}
          seekPreview={null}
          chapters={[]}
          tileAt={() => null}
          elapsed="0:00"
          total="1:40"
          endsAt=""
          onScrub={() => {}}
          onScrubCommit={() => {}}
          onActivate={() => {}}
          onNudge={() => {}}
          onFocus={() => {}}
          onBlur={() => {}}
          {...over}
        />
      </>,
      { remote },
    ),
  );
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

function bar(bufEnd: number | null, cur = 0) {
  const { container } = draw({ bufEnd, cur });
  return [...container.querySelectorAll<HTMLElement>('*')]
    .map((el) => el.style.right)
    .filter((right) => right.endsWith('%'));
}

describe('the forward buffer on the track', () => {
  it('reaches as far as the engine says it holds', () => {
    // 40 of 100 seconds buffered leaves 60% of the track bare.
    expect(bar(40)).toContain('60%');
  });

  it('draws nothing where the engine has no buffered range to report', () => {
    // libVLC and AVPlay answer null: a zero-length fill would read as measured.
    // The one inset left is the PLAYED fill, which every track has.
    expect(bar(null)).toEqual(['100%']);
    expect(bar(40)).toEqual(['60%', '100%']);
  });

  it('never reaches past the end of the track', () => {
    expect(bar(500)).toContain('0%');
  });
});

describe('the seek bar on the navigator', () => {
  it('reports the focus it takes', () => {
    const onFocus = vi.fn();
    draw({ onFocus }, true);

    press('ArrowDown');

    expect(onFocus).toHaveBeenCalled();
  });

  it('steps through the film on Left and Right instead of moving the focus', () => {
    const onNudge = vi.fn();
    draw({ onNudge }, true);

    press('ArrowDown');
    press('ArrowRight');
    press('ArrowLeft');

    expect(onNudge.mock.calls).toEqual([[1], [-1]]);
  });
});
