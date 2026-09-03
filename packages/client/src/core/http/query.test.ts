import { describe, expect, it } from 'vitest';
import { queryString } from './query';

describe('queryString', () => {
  it('drops every value that means "nothing to say"', () => {
    expect(queryString()).toBe('');
    expect(queryString({ a: undefined, b: null, c: false, d: '' })).toBe('');
  });

  it('encodes what is there and drops what is not', () => {
    expect(queryString({ q: 'the wire & co', limit: 20, mine: true, library: undefined })).toBe(
      '?q=the+wire+%26+co&limit=20&mine=true',
    );
  });

  it('sends an empty LIST, because "decode none" is not "no preference"', () => {
    expect(queryString({ copy: [], video: ['aac', 'ac3'] })).toBe('?copy=&video=aac%2Cac3');
  });
});
