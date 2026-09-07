import { describe, expect, it } from 'vitest';
import { moduleRegistry } from './registry';

describe('the module registry', () => {
  it('starts empty: every frontend arrives from the server at runtime', () => {
    expect(moduleRegistry.ids()).toEqual([]);
    expect(moduleRegistry.routes()).toEqual([]);
    expect(moduleRegistry.navItems()).toEqual([]);
  });
});
