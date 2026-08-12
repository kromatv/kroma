import { describe, expect, it } from 'vitest';
import { holdCursor } from './resizable-cursor';

// The node environment on purpose: this is the browser half, and it is loaded
// with no document by every prerender of a page that holds a group.
describe('holdCursor with no document to take', () => {
  it('takes nothing, and gives back a release that does nothing', () => {
    const release = holdCursor('horizontal');
    expect(release).toBeTypeOf('function');
    expect(() => release()).not.toThrow();
  });
});
