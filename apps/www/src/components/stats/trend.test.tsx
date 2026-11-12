// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Trend, type TrendSeries } from './trend.tsx';

const DAYS = ['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'];

const series = (values: TrendSeries['values']): TrendSeries[] => [
  { id: 'titles', label: 'Titles', unit: 'titles', values },
];

function strokes(): string[] {
  const line = [...document.querySelectorAll('path')].find(
    (path) => path.getAttribute('fill') === 'none',
  );
  return (line?.getAttribute('d') ?? '').split('M').filter(Boolean);
}

afterEach(cleanup);

describe('Trend', () => {
  it('draws one unbroken line when every day has a value', () => {
    render(<Trend days={DAYS} series={series([1, 2, 3, 4, 5])} empty="none" />);

    expect(strokes()).toHaveLength(1);
  });

  it('breaks the line where a day has no published value instead of dropping to zero', () => {
    render(<Trend days={DAYS} series={series([null, 1240, 1792, null, 3870])} empty="none" />);

    expect(strokes()).toHaveLength(2);
  });

  it('shows a dash for a latest day that has no published value', () => {
    render(<Trend days={DAYS} series={series([1, 2, 3, 4, null])} empty="none" />);

    expect(screen.getByText('-')).toBeDefined();
  });
});
