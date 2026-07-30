import { describe, expect, it } from 'vitest';
import { parseRich, plainRich } from './rich';

describe('parseRich', () => {
  it('returns a plain message as one run', () => {
    expect(parseRich('Install KROMA')).toEqual([{ kind: 'text', value: 'Install KROMA' }]);
  });

  it('reads the three markers', () => {
    expect(parseRich('[amber] and `mono` and *bright*')).toEqual([
      { kind: 'accent', value: 'amber' },
      { kind: 'text', value: ' and ' },
      { kind: 'code', value: 'mono' },
      { kind: 'text', value: ' and ' },
      { kind: 'bright', value: 'bright' },
    ]);
  });

  it('keeps the text around a marker, in order', () => {
    expect(parseRich('Six containers. [One server.]')).toEqual([
      { kind: 'text', value: 'Six containers. ' },
      { kind: 'accent', value: 'One server.' },
    ]);
  });

  it('does not care where in the sentence the accent falls', () => {
    expect(parseRich('[Votre médiathèque], chez vous.')).toEqual([
      { kind: 'accent', value: 'Votre médiathèque' },
      { kind: 'text', value: ', chez vous.' },
    ]);
  });

  it('treats an unclosed marker as literal text', () => {
    expect(parseRich('a [broken message')).toEqual([{ kind: 'text', value: 'a [broken message' }]);
  });

  it('treats an empty marker as literal text', () => {
    expect(parseRich('brackets [] here')).toEqual([{ kind: 'text', value: 'brackets [] here' }]);
  });

  it('leaves punctuation that only looks like a marker alone', () => {
    expect(parseRich('2 * 3 = 6')).toEqual([{ kind: 'text', value: '2 * 3 = 6' }]);
  });
});

describe('plainRich', () => {
  it('strips the markers for an alt or a title', () => {
    expect(plainRich('Run `docker compose up` on *Linux* [now]')).toBe(
      'Run docker compose up on Linux now',
    );
  });
});
