import { describe, expect, it } from 'vitest';
import { layout, toolDir } from './layout';

describe('layout', () => {
  it('keeps clones and the venv under the ignored target directory, and reports under .metrics', () => {
    const at = layout('/repo');

    expect(at).toEqual({
      root: '/repo',
      pins: '/repo/packages/quality-tools/pins.txt',
      requirements: '/repo/packages/quality-tools/requirements.txt',
      tools: '/repo/target/quality-tools',
      scripts: '/repo/packages/quality-tools/python',
      python: '/repo/target/quality-tools/venv/bin/python',
      metrics: '/repo/.metrics',
      mergedLcov: '/repo/target/coverage/quality/lcov.info',
    });
    expect(toolDir(at, 'mutator')).toBe('/repo/target/quality-tools/mutator');
  });
});
