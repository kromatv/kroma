// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { browserStorage, layoutsOf, readLayout, writeLayout } from './resizable-store';

const held = new Map<string, string>();

const memory = {
  getItem: (key: string) => held.get(key) ?? null,
  setItem: (key: string, value: string) => {
    held.set(key, value);
  },
};

// Restored after any test that gives the runner a store, takes it away, or
// makes reading it throw.
const own = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

afterEach(() => {
  held.clear();
  if (own) Object.defineProperty(globalThis, 'localStorage', own);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('browserStorage', () => {
  it('is the store the platform itself provides', () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
    expect(browserStorage()).toBe(memory);
  });

  it('is nothing on a target that has none', () => {
    // React Native has no localStorage at all; a host that wants a layout to
    // survive a reload passes its own device store in.
    Reflect.deleteProperty(globalThis, 'localStorage');
    expect(browserStorage()).toBeNull();
  });

  it('is nothing where the property itself refuses to be read', () => {
    // Privacy mode and a sandboxed iframe both throw on the access, before any
    // read: a group that cannot remember a layout still has to open.
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('denied');
      },
    });
    expect(browserStorage()).toBeNull();
  });
});

describe('layoutsOf', () => {
  it('takes the arrangements whose sizes are all numbers', () => {
    expect(layoutsOf({ two: [25, 75], three: [20, 40, 40] })).toEqual({
      two: [25, 75],
      three: [20, 40, 40],
    });
  });

  it('drops an arrangement that is not a list of sizes at all', () => {
    expect(layoutsOf({ two: 'wide', three: [20, 'wide'], four: [1, -1] })).toEqual({});
  });

  it('reads nothing at all out of a value that is not an object', () => {
    expect(layoutsOf('[25, 75]')).toEqual({});
    expect(layoutsOf(null)).toEqual({});
  });
});

describe('readLayout', () => {
  it('gives back the sizes written for this arrangement', () => {
    writeLayout(memory, 'panes', 'two', [25, 75]);
    expect(readLayout(memory, 'panes', 'two')).toEqual([25, 75]);
    expect(readLayout(memory, 'panes', 'three')).toBeNull();
  });

  it('reads nothing out of a value that is not JSON', () => {
    held.set('panes', 'not json at all');
    expect(readLayout(memory, 'panes', 'two')).toBeNull();
  });

  it('reads nothing without a key to read it under', () => {
    writeLayout(memory, undefined, 'two', [25, 75]);
    expect(readLayout(memory, undefined, 'two')).toBeNull();
    expect(held.size).toBe(0);
  });
});
