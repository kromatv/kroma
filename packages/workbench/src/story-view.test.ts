import { sv } from '@kroma/ui/kit';
import { describe, expect, it } from 'vitest';
import { story } from './story';
import { withCode } from './story-code';
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

const written = () =>
  withCode(chip(), { render: '<Chip label="HDR" />', scenes: ['<Chip.Row />', ''] });

describe('viewCode', () => {
  it('shows a scene the JSX it was written as', () => {
    expect(viewCode(written(), 'scene:0', {})).toBe('<Chip.Row />');
  });

  it('shows nothing beside a scene no build could read, rather than the wrong code', () => {
    expect(viewCode(written(), 'scene:1', {})).toBeNull();
    expect(viewCode(chip(), 'scene:0', {})).toBeNull();
  });

  it('shows the story’s own render on a preview that had nothing to show', () => {
    const composed = withCode(plain(), { render: '<Chip.Row />', scenes: [] });
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

  it('still shows a demo its own file', () => {
    const withDemo = {
      ...written(),
      demos: [{ name: 'Pair', code: 'export default Pair;', render: () => null }],
    };
    expect(viewCode(withDemo, 'demo:0', {})).toBe('export default Pair;');
  });
});
