import { colors } from '@kroma/ui/tokens/colors';
import { describe, expect, it } from 'vitest';
import { CHART_SERIES } from './chart-palette';

// A series is stroked into an SVG, so this is the one place in the admin
// holding token VALUES. That is exactly why a renamed or deleted token has to
// fail here rather than paint `undefined` on a chart.
const RESOLVED = /^(#[0-9A-Fa-f]{3,8}|rgba?\()/;

describe('the admin chart palette', () => {
  it('resolves every series to a real colour', () => {
    for (const [role, value] of Object.entries(CHART_SERIES)) {
      expect(value, role).toMatch(RESOLVED);
    }
  });

  it('takes its series straight from the palette rather than a copy of it', () => {
    expect(CHART_SERIES.local).toBe(colors.accent);
    expect(CHART_SERIES.remote).toBe(colors.info);
    expect(CHART_SERIES.kroma).toBe(colors.success);
  });

  it('tells the two traffic origins apart, which is the one thing a reader learns', () => {
    expect(CHART_SERIES.local).not.toBe(CHART_SERIES.remote);
  });
});
