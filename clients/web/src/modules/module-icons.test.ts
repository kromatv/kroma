import { describe, expect, it } from 'vitest';
import { resolveModuleIcon } from './module-icons';

describe('resolveModuleIcon', () => {
  it('maps known names to their icon component', () => {
    expect(resolveModuleIcon('movie')).toBe('movie');
    expect(resolveModuleIcon('tv')).toBe('device-tv');
    expect(resolveModuleIcon('chart')).toBe('chart-bar');
  });

  it('maps aliases to the same icon (stats -> chart)', () => {
    expect(resolveModuleIcon('stats')).toBe('chart-bar');
    expect(resolveModuleIcon('stats')).toBe(resolveModuleIcon('chart'));
  });

  it('falls back to the apps icon for unknown / empty / missing names', () => {
    expect(resolveModuleIcon('does-not-exist')).toBe('apps');
    expect(resolveModuleIcon('')).toBe('apps');
    expect(resolveModuleIcon(undefined)).toBe('apps');
  });
});
