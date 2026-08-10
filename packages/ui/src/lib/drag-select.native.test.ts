import { describe, expect, it } from 'vitest';
import { suppressSelection } from './drag-select';

describe('suppressSelection', () => {
  it('has nothing to suppress on a television, and hands back a safe undo', () => {
    const undo = suppressSelection();
    expect(undo).toBeTypeOf('function');
    expect(() => undo()).not.toThrow();
    expect(suppressSelection()).toBe(undo);
  });
});
