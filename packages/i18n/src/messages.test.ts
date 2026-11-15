import { describe, expect, it } from 'vitest';
import { baseKeys, generalForm, groupMessages, variablesOf, variantOf } from './messages';

const CART = {
  'cart.items': '{count} items in {store}',
  'cart.items_one': 'One item in {store}',
  'cart.seats': 'Seats',
  'cart.seats_taken_one': '{taken} seat taken',
  'status.other': 'Other',
  'filter.kind_other': 'Another kind',
};

describe('variantOf', () => {
  it('reads a category suffix as a variant on count where its base exists', () => {
    expect(variantOf('cart.items_one', new Set(['cart.items']))).toEqual({
      base: 'cart.items',
      selector: 'count',
      category: 'one',
    });
  });

  it('reads the variable between the base and the category as the selector', () => {
    expect(variantOf('cart.seats_taken_one', new Set(['cart.seats']))).toMatchObject({
      base: 'cart.seats',
      selector: 'taken',
    });
  });

  it('leaves a key alone when nothing it could be a variant of exists', () => {
    expect(variantOf('filter.kind_other', new Set(['filter.name']))).toBeNull();
    expect(variantOf('status.other', new Set(['status']))).toBeNull();
  });
});

describe('baseKeys', () => {
  it('keeps the keys a screen names and drops their plural variants', () => {
    expect([...baseKeys(CART)].sort()).toEqual([
      'cart.items',
      'cart.seats',
      'filter.kind_other',
      'status.other',
    ]);
  });
});

describe('a plural written without a base key', () => {
  const VIDEOS = {
    'contents.videos_one': '{count} video',
    'contents.videos_other': '{count} videos',
  };

  it('is one message, named by its stem', () => {
    const { messages } = groupMessages(VIDEOS);

    expect([...messages.keys()]).toEqual(['contents.videos']);
    expect(Object.fromEntries(variablesOf(messages.get('contents.videos')!))).toEqual({
      count: 'number',
    });
  });

  it('falls to its other form where it has no base', () => {
    const { messages } = groupMessages(VIDEOS);

    expect(generalForm(messages.get('contents.videos')!)).toBe('{count} videos');
  });

  it('is not read into a lone key that only ends like a category', () => {
    expect([...baseKeys({ 'filter.kind_other': 'Another kind' })]).toEqual(['filter.kind_other']);
  });
});

describe('groupMessages', () => {
  it('folds each variant into the message it belongs to', () => {
    const { messages } = groupMessages(CART);

    expect(Object.keys(messages.get('cart.items')?.forms ?? {})).toEqual([
      'cart.items',
      'cart.items_one',
    ]);
    expect(messages.get('cart.seats')?.selectors).toEqual(['taken']);
  });

  it('reads a translation against the messages of its source', () => {
    const russian = { 'cart.items': '{count} товаров', 'cart.items_few': '{count} товара' };

    const { messages, strays } = groupMessages(russian, baseKeys(CART));

    expect(Object.keys(messages.get('cart.items')?.forms ?? {})).toHaveLength(2);
    expect(strays).toEqual([]);
  });

  it('reports a key the source has no message for', () => {
    const { strays } = groupMessages({ 'cart.gone': 'x', 'cart.gone_one': 'y' }, baseKeys(CART));

    expect(strays).toEqual(['cart.gone', 'cart.gone_one']);
  });

  it('keeps a variant whose base the translation has not written yet', () => {
    const { messages } = groupMessages({ 'cart.items_one': 'Ein Artikel' }, baseKeys(CART));

    expect(messages.get('cart.items')?.forms).toEqual({ 'cart.items_one': 'Ein Artikel' });
  });
});

describe('variablesOf', () => {
  it('names every token of every form, and types a selector as a number', () => {
    const { messages } = groupMessages(CART);

    expect(Object.fromEntries(variablesOf(messages.get('cart.items')!))).toEqual({
      count: 'number',
      store: 'value',
    });
    expect(Object.fromEntries(variablesOf(messages.get('cart.seats')!))).toEqual({
      taken: 'number',
    });
  });

  it('is empty for a message that takes nothing', () => {
    const { messages } = groupMessages(CART);

    expect(variablesOf(messages.get('status.other')!).size).toBe(0);
  });
});
