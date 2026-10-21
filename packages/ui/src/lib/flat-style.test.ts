import { describe, expect, it } from 'vitest';
import { flat } from './flat-style';

describe('flat', () => {
  it('merges a style array into one object', () => {
    expect(flat([{ margin: 1 }, { padding: 2 }])).toEqual({ margin: 1, padding: 2 });
  });

  it('answers an empty style for no style', () => {
    expect(flat(undefined)).toEqual({});
  });
});
