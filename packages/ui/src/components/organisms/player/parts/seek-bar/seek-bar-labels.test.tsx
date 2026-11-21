// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { onScreen } from '#ui/testing';
import { SeekBarLabels, type SeekBarLabelsProps } from './seek-bar-labels.component';

afterEach(cleanup);

function draw(over: Partial<SeekBarLabelsProps> = {}) {
  return render(onScreen(<SeekBarLabels elapsed="0:42" total="1:40" endsAt="" {...over} />))
    .container;
}

describe('the times above the seek bar', () => {
  it('prints the elapsed time and the total', () => {
    const text = draw().textContent;

    expect(text).toContain('0:42');
    expect(text).toContain('1:40');
  });

  it('follows the elapsed time with the chapter title', () => {
    expect(draw({ chapterLabel: 'Opening' }).textContent).toContain('0:42 · Opening');
  });

  it('follows the total with the time the title ends at', () => {
    expect(draw({ endsAt: '21:30' }).textContent).toContain('1:40 · 21:30');
  });

  it('leaves out the separators when there is no chapter and no end time', () => {
    expect(draw().textContent).not.toContain('·');
  });

  it('scales with the player', () => {
    expect(draw({ scale: 2 }).textContent).toContain('0:42');
  });
});
