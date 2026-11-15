import { describe, expect, it } from 'vitest';
import { CardSection } from './schemas';

const section = (layout?: unknown) => ({ id: 'row', title: 'Row', layout, items: [] });

describe('a home section layout', () => {
  it('reads a layout this client knows as itself', () => {
    expect(CardSection.parse(section('ranked')).layout).toBe('ranked');
  });

  it('reads a layout a newer server invented as a rail', () => {
    expect(CardSection.parse(section('mosaic')).layout).toBe('rail');
  });

  it('reads a section an older server sent without a layout as a rail with no notes', () => {
    const parsed = CardSection.parse({ id: 'row', title: 'Row', items: [] });

    expect(parsed.layout).toBe('rail');
    expect(parsed.notes).toEqual({});
  });
});
