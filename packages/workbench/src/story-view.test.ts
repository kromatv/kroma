import { sv } from '@kroma/ui/kit';
import { describe, expect, it } from 'vitest';
import { type Story, story } from './story';
import { viewCode } from './story-view';

const tones = sv({ base: {}, variants: { tone: { neutral: {}, danger: {} } } });

const chip = () =>
  story({
    name: 'Chip',
    group: 'Actions',
    variants: tones,
    args: { label: 'HDR' },
    render: () => null,
    scenes: [{ name: 'A row' }, { name: 'Alone' }],
  });

// The same story with nothing for the controls to describe, which is where the
// generated call site stops being the better answer.
const plain = () =>
  story({ name: 'Chip', group: 'Actions', render: () => null, scenes: [{ name: 'A row' }] });

// The shape a compiled `.story.mdx` arrives in: the compiler embedded the
// story's own source and each scene's, an args-only scene carrying the story's.
const written = (): Story => {
  const base = chip();
  const sources = ['<Chip.Row />', '<Chip label="HDR" />'];
  return {
    ...base,
    code: '<Chip label="HDR" />',
    scenes: base.scenes.map((scene, at) => {
      const code = sources[at];
      return code ? { ...scene, code } : scene;
    }),
  };
};

describe('viewCode', () => {
  it('shows a scene the JSX it was written as', () => {
    expect(viewCode(written(), 'scene:0', {})).toBe('<Chip.Row />');
  });

  it("carries the story's own source on a scene that declared only args", () => {
    expect(viewCode(written(), 'scene:1', {})).toBe('<Chip label="HDR" />');
  });

  it('shows nothing where the compiler embedded no source at all, rather than a guess', () => {
    expect(viewCode(chip(), 'scene:0', {})).toBeNull();
  });

  it('shows the story’s own render on a preview that had nothing to show', () => {
    const composed = { ...plain(), code: '<Chip.Row />' };
    expect(viewCode(plain(), 'preview', {})).toBeNull();
    expect(viewCode(composed, 'preview', {})).toBe('<Chip.Row />');
  });

  it('leaves the live preview on the call site, which is the one code that follows a control', () => {
    expect(viewCode(written(), 'preview', { label: 'HDR', tone: 'danger' })).toBe(
      '<Chip tone="danger" label="HDR" />',
    );
  });

  it('shows nothing on the matrix, which is every variant at once', () => {
    expect(viewCode(written(), 'matrix', {})).toBeNull();
  });

  it('shows nothing on the document, which carries its own samples', () => {
    expect(viewCode(written(), 'docs', {})).toBeNull();
  });

  it('still shows a demo its own file', () => {
    const withDemo = {
      ...written(),
      demos: [{ name: 'Pair', code: 'export default Pair;', render: () => null }],
    };
    expect(viewCode(withDemo, 'demo:0', {})).toBe('export default Pair;');
  });
});
