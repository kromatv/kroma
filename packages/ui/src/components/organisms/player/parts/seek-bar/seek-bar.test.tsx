// @vitest-environment jsdom

import { I18nProvider } from '@kroma/ui';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SeekBar } from './seek-bar';

afterEach(cleanup);

// The one face this pins: an engine's forward buffer, drawn between the
// playhead and where it reaches. It is a percentage inset, so it survives the
// track being laid out at any width, which is what a jsdom render never gives.
function bar(bufEnd: number | null, cur = 0) {
  const { container } = render(
    <I18nProvider locale="en">
      <SeekBar
        cur={cur}
        dur={100}
        bufEnd={bufEnd}
        seekPreview={null}
        chapters={[]}
        tileAt={() => null}
        focused={false}
        elapsed="0:00"
        total="1:40"
        endsAt=""
        onScrub={() => {}}
        onScrubCommit={() => {}}
      />
    </I18nProvider>,
  );
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
