import { describe, expect, it, vi } from 'vitest';

const fabric = vi.hoisted((): { dom: unknown } => ({ dom: null }));

vi.mock('react-native', () => ({ TurboModuleRegistry: { get: () => fabric.dom } }));

const { hostBox } = await import('./host-box');

const node = { shadow: true };
const host = { tag: 5, child: null, sibling: null, stateNode: { node } };
const component = { tag: 0, child: { tag: 7, child: host, sibling: null }, sibling: null };

describe('a box under Fabric', () => {
  it('is null when the renderer has no DOM module', () => {
    fabric.dom = null;

    expect(hostBox(component)).toBeNull();
  });

  it.each([
    ['nothing', undefined],
    ['an empty list', []],
    ['a list that is not four numbers', [1, 2, 'wide', 4]],
  ])('is null when the module answers %s', (_what, answer) => {
    fabric.dom = { getBoundingClientRect: () => answer };

    expect(hostBox(component)).toBeNull();
  });

  it('is null for a host that holds no shadow node', () => {
    fabric.dom = { getBoundingClientRect: () => [0, 0, 1, 1] };

    expect(hostBox({ tag: 0, child: { ...host, stateNode: null }, sibling: null })).toBeNull();
  });

  it('is null for a component that draws no host element', () => {
    fabric.dom = { getBoundingClientRect: () => [0, 0, 1, 1] };

    expect(hostBox({ tag: 0, child: null, sibling: null })).toBeNull();
  });

  it('is the rectangle the module measures for the shadow node, transforms included', () => {
    const getBoundingClientRect = vi.fn(() => [1, 2, 3, 4]);
    fabric.dom = { getBoundingClientRect };

    expect(hostBox(component)).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(getBoundingClientRect).toHaveBeenCalledWith(node, true);
  });
});
