import { describe, expect, it } from 'vitest';
import { inSourceOrder, sourceOf } from './source';

const source = sourceOf(
  'en',
  new Map([
    [
      'nav',
      { 'nav.home': 'Home', 'nav.count_one': 'One', 'nav.count_other': 'Many', 'nav.back': 'Back' },
    ],
  ]),
);

describe('inSourceOrder', () => {
  it('puts a form only the translation has after its base, and keys the source lacks last, by name', () => {
    const catalog = {
      'zz.extra': 'z',
      'nav.back': 'Retour',
      'nav.count_many': 'm',
      'aa.extra': 'a',
      'nav.home': 'Accueil',
    };

    expect(Object.keys(inSourceOrder(catalog, source))).toEqual([
      'nav.home',
      'nav.count_many',
      'nav.back',
      'aa.extra',
      'zz.extra',
    ]);
  });
});
