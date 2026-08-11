import { describe, expect, it } from 'vitest';
import { blocks, segments } from './markdown';

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

  it('reads a link as its words plus a destination', () => {
    expect(segments('see [Standard Schema](https://standardschema.dev) for it')).toEqual([
      { text: 'see ', mark: 'plain' },
      { text: 'Standard Schema', mark: 'link', href: 'https://standardschema.dev' },
      { text: ' for it', mark: 'plain' },
    ]);
  });

  it('leaves bracketed prose that is not a link alone', () => {
    expect(segments('a [note] and (an aside)')).toEqual([
      { text: 'a [note] and (an aside)', mark: 'plain' },
    ]);
  });

  it('keeps a mark inside a code span literal: the span wins', () => {
    expect(segments('`a **b** c`')).toEqual([{ text: 'a **b** c', mark: 'code' }]);
  });
});

describe('blocks', () => {
  it('joins soft-wrapped lines into one paragraph and breaks on a blank line', () => {
    expect(blocks('one line\nwrapped here\n\nsecond')).toEqual([
      { kind: 'paragraph', text: 'one line wrapped here' },
      { kind: 'paragraph', text: 'second' },
    ]);
  });

  it('reads the two heading levels', () => {
    expect(blocks('# Title\n\n## Section\n\nbody')).toEqual([
      { kind: 'heading', level: 1, text: 'Title' },
      { kind: 'heading', level: 2, text: 'Section' },
      { kind: 'paragraph', text: 'body' },
    ]);
  });

  it('leaves a deeper heading as prose rather than inventing a level', () => {
    expect(blocks('### Deep')).toEqual([{ kind: 'paragraph', text: '### Deep' }]);
  });

  it('gathers consecutive dashes into one list', () => {
    expect(blocks('intro\n\n- first\n- second\n\nafter')).toEqual([
      { kind: 'paragraph', text: 'intro' },
      { kind: 'list', items: ['first', 'second'] },
      { kind: 'paragraph', text: 'after' },
    ]);
  });

  it('does not read a bold run at the start of a line as a bullet', () => {
    expect(blocks('**Root** owns the value')).toEqual([
      { kind: 'paragraph', text: '**Root** owns the value' },
    ]);
  });

  it('takes a fenced block verbatim, with its language', () => {
    expect(blocks('before\n\n```tsx\n<Button />\n\n<Card />\n```\n\nafter')).toEqual([
      { kind: 'paragraph', text: 'before' },
      { kind: 'code', code: '<Button />\n\n<Card />', lang: 'tsx' },
      { kind: 'paragraph', text: 'after' },
    ]);
  });

  it('leaves an unclosed fence literal rather than eating the rest of the file', () => {
    expect(blocks('```tsx\n<Button />\n\nstill prose')).toEqual([
      { kind: 'paragraph', text: '```tsx <Button />' },
      { kind: 'paragraph', text: 'still prose' },
    ]);
  });

  it('reads a one-line description as the single paragraph it is', () => {
    expect(blocks('A row of a settings list.')).toEqual([
      { kind: 'paragraph', text: 'A row of a settings list.' },
    ]);
  });

  it('has nothing to say about nothing', () => {
    expect(blocks('')).toEqual([]);
  });
});
