import { describe, expect, it } from 'vitest';
import { createModuleRuntime } from './registry';

describe('the module registry', () => {
  it('starts empty: every frontend arrives from the server at runtime', () => {
    const { registry: moduleRegistry } = createModuleRuntime();
    expect(moduleRegistry.ids()).toEqual([]);
    expect(moduleRegistry.routes()).toEqual([]);
    expect(moduleRegistry.navItems()).toEqual([]);
  });
});

it('disposes only the leaving host registry and survives immediate effect replay', async () => {
  const a = createModuleRuntime();
  const b = createModuleRuntime();
  const releaseA = a.retain();
  const releaseB = b.retain();
  a.registry.register({ id: 'a', version: '1.0.0' });
  b.registry.register({ id: 'b', version: '1.0.0' });
  releaseA();
  const releaseAgain = a.retain();
  await Promise.resolve();
  expect(a.registry.has('a')).toBe(true);
  releaseAgain();
  await Promise.resolve();
  expect(a.registry.ids()).toEqual([]);
  expect(b.registry.ids()).toEqual(['b']);
  releaseB();
  await Promise.resolve();
  expect(b.registry.ids()).toEqual([]);
});
