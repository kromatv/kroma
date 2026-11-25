import { describe, expect, it } from 'vitest';
import { RULES } from '#ui/core/shorthands';
import { textAlignOf } from './text-align';

describe('textAlignOf on a browser', () => {
  it('hands the renderer start and end, which it resolves against the writing direction', () => {
    expect([textAlignOf('start'), textAlignOf('end'), textAlignOf('center')]).toEqual([
      'start',
      'end',
      'center',
    ]);
  });

  it('is what the text vocabulary resolves to', () => {
    expect(RULES.textAlign('end')).toEqual({ textAlign: 'end' });
  });
});
