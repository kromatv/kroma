import { describe, expect, it } from 'vitest';
import { clipsOf } from './clips';

const BOX = { x: 10, y: 20, width: 60, height: 20 };
const CUT = { width: 8, height: 0 };

function text(children: unknown, clipped?: typeof CUT) {
  return {
    name: 'Text',
    props: { children },
    box: BOX,
    ...(clipped ? { clipped } : {}),
    children: [],
  };
}

function tree(...nodes: unknown[]) {
  return { fibers: 9, nodes: [{ name: 'Card', props: {}, box: null, children: nodes }] };
}

describe('the clipped texts of a screen', () => {
  it('are the clipped texts at any depth, in document order', () => {
    const answer = tree(text('Gefolgt', CUT), {
      ...text('Fits'),
      children: [text('Laufzeit', CUT)],
    });

    expect(clipsOf(answer).map((clip) => clip.text)).toEqual(['Gefolgt', 'Laufzeit']);
  });

  it('keep where each text sits and how much of it is cut', () => {
    expect(clipsOf(tree(text('Gefolgt', CUT)))).toEqual([
      { text: 'Gefolgt', box: BOX, clipped: CUT },
    ]);
  });

  it.each([
    ['a list of strings', '[array 2]'],
    ['an element', '[element]'],
    ['a string the reader cut short', `${'x'.repeat(120)}…`],
    ['no children', undefined],
  ])('carry no text for %s, for the page to read it from its box', (_what, children) => {
    expect(clipsOf(tree(text(children, CUT)))[0]?.text).toBeNull();
  });

  it('refuse an answer that is not a screen', () => {
    expect(() => clipsOf({ nodes: [{ name: 'Text' }] })).toThrow();
  });
});
