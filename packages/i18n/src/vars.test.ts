import { describe, expectTypeOf, it } from 'vitest';
import type { TVars } from './types';
import type { Templated, VarsOf } from './vars';

interface Shapes {
  'nav.home': Record<never, never>;
  'cart.items': { count: number; store: string | number };
}

describe('VarsOf', () => {
  it('requires the variables of a key written out', () => {
    expectTypeOf<VarsOf<Shapes, 'cart.items'>>().toEqualTypeOf<
      [vars: { count: number; store: string | number }]
    >();
  });

  it('takes none for a message that names none', () => {
    expectTypeOf<VarsOf<Shapes, 'nav.home'>>().toEqualTypeOf<[vars?: Record<string, never>]>();
  });

  it('accepts any for a key only known to be one of several', () => {
    expectTypeOf<VarsOf<Shapes, keyof Shapes>>().toEqualTypeOf<[vars?: TVars]>();
  });

  it('accepts any where the map names no key, as before a project registers', () => {
    expectTypeOf<VarsOf<Record<string, TVars>, 'whatever'>>().toEqualTypeOf<[vars?: TVars]>();
  });

  it('accepts any for a catalog handed in, which says nothing of variables', () => {
    expectTypeOf<VarsOf<{ greeting: string }, 'greeting'>>().toEqualTypeOf<[vars?: TVars]>();
  });
});

type Keys = 'genre.drama' | 'genre.comedy' | 'nav.home';

describe('Templated', () => {
  it('takes a template that at least one key fits', () => {
    expectTypeOf<Templated<Keys, `genre.${string}`>>().toEqualTypeOf<`genre.${string}`>();
  });

  it('refuses a template no key fits, a key written out, and a bare string', () => {
    expectTypeOf<Templated<Keys, `genr.${string}`>>().toBeNever();
    expectTypeOf<Templated<Keys, 'nav.home'>>().toBeNever();
    expectTypeOf<Templated<Keys, string>>().toBeNever();
  });
});
