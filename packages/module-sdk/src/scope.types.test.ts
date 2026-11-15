import { describe, expectTypeOf, it } from 'vitest';
import type { CheckedTranslate } from './scope';

interface Own {
  'page.title': Record<never, never>;
  'page.hello': { answer: string | number };
}

const t = ((key: string) => key) as CheckedTranslate<Own>;
const held: string = 'page.title';
const flag: string = 'internal';

describe('a module translator with declared messages', () => {
  it('takes a key written out with the variables its message names', () => {
    expectTypeOf(t('page.hello', { answer: 42 })).toBeString();
    expectTypeOf(t('page.title')).toBeString();
  });

  it('refuses a key the module does not have, and a call missing its variables', () => {
    // @ts-expect-error not a message of the module
    t('page.titel');
    // @ts-expect-error answer is missing
    t('page.hello');
  });

  it('takes a key only runtime can name, held in a string or built from a template', () => {
    expectTypeOf(t(held)).toBeString();
    expectTypeOf(t(`flag.${flag}`)).toBeString();
  });
});
