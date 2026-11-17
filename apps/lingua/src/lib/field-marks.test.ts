import { describe, expect, it } from 'vitest';
import { fieldMarks } from './field-marks';

describe('fieldMarks', () => {
  it('marks a placeholder the source has, a reference, and one the source does not pass', () => {
    expect(fieldMarks('{free} sur $t(a.b) {gb}', '{free} of {total}', { plural: false })).toEqual([
      { text: '{free}', tone: 'placeholder', at: 0 },
      { text: ' sur ', tone: 'plain', at: 6 },
      { text: '$t(a.b)', tone: 'ref', at: 11 },
      { text: ' ', tone: 'plain', at: 18 },
      { text: '{gb}', tone: 'unknown', at: 19 },
    ]);
  });

  it('lets a plural form name the count its source lacks', () => {
    expect(fieldMarks('{count} film', 'One movie', { plural: true })[0]?.tone).toBe('placeholder');
    expect(fieldMarks('{count} film', 'One movie', { plural: false })[0]?.tone).toBe('unknown');
  });

  it('adds a space after a trailing line break, so the mirror is as tall as the field', () => {
    expect(fieldMarks('Ligne\n', 'Line', { plural: false })).toEqual([
      { text: 'Ligne\n', tone: 'plain', at: 0 },
      { text: ' ', tone: 'plain', at: 6 },
    ]);
  });

  it('has no run for an empty field', () => {
    expect(fieldMarks('', '{a}', { plural: false })).toEqual([]);
  });
});
