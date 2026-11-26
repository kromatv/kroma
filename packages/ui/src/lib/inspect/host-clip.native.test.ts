import { describe, expect, it } from 'vitest';
import { hostClip } from './host-clip';

describe('what a text loses to its box under Fabric', () => {
  it('is not measured, so a clamped text reads as uncut', () => {
    const paragraph = { tag: 5, child: null, sibling: null, stateNode: { node: {} } };

    expect(hostClip({ tag: 0, child: paragraph, sibling: null })).toBeNull();
  });
});
