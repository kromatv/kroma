import { describe, expect, it } from 'vitest';
import { hostView } from './host-view';

const publicInstance = { focus: () => {} };

describe('the view of a host under Fabric', () => {
  it('is the public instance a ref on the element gives', () => {
    const host = { tag: 5, stateNode: { node: {}, canonical: { publicInstance } } };

    expect(hostView(host)).toBe(publicInstance);
  });

  it.each([
    ['no instance', { tag: 5, stateNode: null }],
    ['an instance with no canonical', { tag: 5, stateNode: { node: {} } }],
    ['a public instance nothing created yet', { tag: 5, stateNode: { canonical: {} } }],
  ])('is null for a host with %s', (_what, host) => {
    expect(hostView(host)).toBeNull();
  });
});
