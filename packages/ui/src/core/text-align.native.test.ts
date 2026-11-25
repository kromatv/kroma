import { describe, expect, it } from 'vitest';
import { textAlignOf } from '#ui/core/text-align';

describe('textAlignOf on React Native', () => {
  it('turns start and end into the left and right it swaps itself under a right-to-left layout', () => {
    expect([textAlignOf('start'), textAlignOf('end')]).toEqual(['left', 'right']);
  });

  it('passes every other alignment through', () => {
    expect([textAlignOf('center'), textAlignOf('justify'), textAlignOf('auto')]).toEqual([
      'center',
      'justify',
      'auto',
    ]);
  });
});
