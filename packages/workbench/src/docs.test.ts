import { describe, expect, it } from 'vitest';
import { segments, snippet } from './docs';
import { type Story, story } from './story';

describe('segments', () => {
  it('splits bold and code out of prose, in order', () => {
    expect(segments('a **bold** and `code` end')).toEqual([
      { text: 'a ', mark: 'plain' },
      { text: 'bold', mark: 'bold' },
      { text: ' and ', mark: 'plain' },
      { text: 'code', mark: 'code' },
      { text: ' end', mark: 'plain' },
    ]);
  });

  it('leaves unclosed marks literal instead of eating the paragraph', () => {
    expect(segments('a ** loose star and ` tick')).toEqual([
      { text: 'a ** loose star and ` tick', mark: 'plain' },
    ]);
  });
});

describe('snippet', () => {
  const make = (over: Partial<Story>): Story =>
    ({
      ...story({ name: 'Button', group: 'Actions', render: () => null }),
      ...over,
    }) as Story;

  it('writes booleans bare when on, drops them when off, quotes strings', () => {
    const s = make({
      controls: [
        { key: 'variant', control: { kind: 'select', options: ['primary'] }, variant: true },
        { key: 'block', control: { kind: 'boolean' }, variant: true },
        { key: 'label', control: { kind: 'text' }, variant: false },
        { key: 'pad', control: { kind: 'number', min: 0, max: 9, step: 1 }, variant: false },
      ],
    });
    expect(snippet(s, { variant: 'primary', block: true, label: 'Play', pad: 4 })).toBe(
      '<Button variant="primary" block label="Play" pad={4} />',
    );
    expect(snippet(s, { variant: 'primary', block: false, label: '' })).toBe(
      '<Button variant="primary" />',
    );
  });

  it('breaks one prop per line once the call stops fitting', () => {
    const s = make({
      controls: [
        { key: 'label', control: { kind: 'text' }, variant: false },
        { key: 'hint', control: { kind: 'text' }, variant: false },
      ],
    });
    const long = snippet(s, {
      label: 'A rather long label for a settings row',
      hint: 'And a hint that explains what the row does',
    });
    expect(long.startsWith('<Button\n  label=')).toBe(true);
    expect(long.endsWith('\n/>')).toBe(true);
  });

  it('strips spaces from a story name to form the tag', () => {
    const s = make({ name: 'Progress Ring', controls: [] });
    expect(snippet(s, {})).toBe('<ProgressRing />');
  });

  // A JSX attribute is not a JS string literal: it does not process backslash
  // escapes, so `\"` ends the attribute and the paste is a syntax error.
  it('escapes a quote as an entity, not as a backslash', () => {
    const s = make({ controls: [{ key: 'label', control: { kind: 'text' }, variant: false }] });
    const out = snippet(s, { label: 'Say "hello"' });
    expect(out).toBe('<Button label="Say &quot;hello&quot;" />');
    expect(out).not.toContain('\\');
  });
});
