import { describe, expect, it } from 'vitest';
import { useStageRatio } from './stage-ratio.hook';

describe('useStageRatio (native)', () => {
  it('is what the chrome measured: a native shell IS its screen', () => {
    expect(useStageRatio('kroma-player-stage', 16 / 9)).toBeCloseTo(16 / 9, 6);
  });
});
