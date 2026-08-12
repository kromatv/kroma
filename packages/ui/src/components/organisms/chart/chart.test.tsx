// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SERIES_COLORS } from '#ui/core/tokens';
import { Chart } from './chart';

afterEach(cleanup);

const SAMPLES = [
  { at: 'now', remote: 0, local: 4 },
  { at: '', remote: 6, local: 2 },
  { at: '30s', remote: 3, local: 8 },
];

const paths = (container: HTMLElement) => [...container.querySelectorAll('path')];

describe('<Chart>', () => {
  it('draws one trace per line', () => {
    const { container } = render(
      <Chart.Root data={SAMPLES} width={200} height={100}>
        <Chart.Line series="remote" />
        <Chart.Line series="local" />
      </Chart.Root>,
    );
    expect(paths(container)).toHaveLength(2);
    expect(paths(container)[0]?.getAttribute('stroke')).toBe(SERIES_COLORS[0]);
    expect(paths(container)[1]?.getAttribute('stroke')).toBe(SERIES_COLORS[1]);
  });

  it('draws an area as a wash under its own trace', () => {
    const { container } = render(
      <Chart.Root data={SAMPLES} width={200} height={100}>
        <Chart.Area series="local" />
      </Chart.Root>,
    );
    const [wash, trace] = paths(container);
    expect(wash?.getAttribute('d')).toMatch(/Z$/);
    expect(wash?.getAttribute('fill')).toBe(SERIES_COLORS[0]);
    expect(trace?.getAttribute('fill')).toBe('none');
  });

  it('takes the paint the mark asks for over the slot its position earns', () => {
    const { container } = render(
      <Chart.Root data={SAMPLES} width={200} height={100}>
        <Chart.Line series="remote" color="#123456" />
      </Chart.Root>,
    );
    expect(paths(container)[0]?.getAttribute('stroke')).toBe('#123456');
  });

  it('renders an empty series without drawing or crashing', () => {
    const { container } = render(
      <Chart.Root data={[]} width={200} height={100}>
        <Chart.Grid />
        <Chart.Area series="remote" />
        <Chart.Axis edge="left" />
      </Chart.Root>,
    );
    expect(paths(container)).toHaveLength(0);
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('keeps an all-zero series on the floor rather than dividing by zero', () => {
    const flat = [{ v: 0 }, { v: 0 }, { v: 0 }];
    const { container } = render(
      <Chart.Root data={flat} width={200} height={100}>
        <Chart.Line series="v" curve="linear" />
      </Chart.Root>,
    );
    expect(paths(container)[0]?.getAttribute('d')).toBe('M0 100L100 100L200 100');
  });

  it('smooths a trace by default, and joins the samples straight when told to', () => {
    const rising = [{ v: 0 }, { v: 5 }, { v: 2 }];
    const { container, rerender } = render(
      <Chart.Root data={rising} width={200} height={100}>
        <Chart.Line series="v" />
      </Chart.Root>,
    );
    expect(paths(container)[0]?.getAttribute('d')).toContain('C');
    rerender(
      <Chart.Root data={rising} width={200} height={100}>
        <Chart.Line series="v" curve="step" />
      </Chart.Root>,
    );
    expect(paths(container)[0]?.getAttribute('d')).toBe('M0 100L100 100L100 0L200 0L200 60');
  });

  it('draws a lone sample as a dot, centred on both axes', () => {
    const { container } = render(
      <Chart.Root data={[{ v: 5 }]} width={200} height={100}>
        <Chart.Line series="v" />
      </Chart.Root>,
    );
    expect(paths(container)[0]?.getAttribute('d')).toBe('M100 50L100 50');
  });

  it('names the plot to assistive tech, and hides one that carries nothing', () => {
    const { container, rerender } = render(
      <Chart.Root data={SAMPLES} width={200} height={100} label="Debit, 4 Mb/s">
        <Chart.Line series="remote" />
      </Chart.Root>,
    );
    expect(screen.getByRole('img', { name: 'Debit, 4 Mb/s' })).toBeTruthy();
    rerender(
      <Chart.Root data={SAMPLES} width={200} height={100}>
        <Chart.Line series="remote" />
      </Chart.Root>,
    );
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it('writes the scale on the left and the sample names along the bottom', () => {
    render(
      <Chart.Root data={SAMPLES} width={260} height={120} min={0} max={10} format={(v) => `${v} %`}>
        <Chart.Axis edge="left" ticks={3} />
        <Chart.Axis edge="bottom" />
        <Chart.Line series="remote" />
      </Chart.Root>,
    );
    expect(screen.getByText('0 %')).toBeTruthy();
    expect(screen.getByText('5 %')).toBeTruthy();
    expect(screen.getByText('10 %')).toBeTruthy();
  });

  it('draws only the sample names there are, when the points are named', () => {
    render(
      <Chart.Root data={SAMPLES} x="at" width={260} height={120}>
        <Chart.Axis edge="bottom" />
        <Chart.Line series="remote" />
      </Chart.Root>,
    );
    expect(screen.getByText('now')).toBeTruthy();
    expect(screen.getByText('30s')).toBeTruthy();
  });

  it('keys the plot by the series that named themselves', () => {
    render(
      <Chart.Root data={SAMPLES} width={200} height={100}>
        <Chart.Line series="remote" label="Distant" />
        <Chart.Line series="local" />
        <Chart.Legend />
      </Chart.Root>,
    );
    expect(screen.getByText('Distant')).toBeTruthy();
    expect(screen.queryByText('local')).toBeNull();
  });

  it('reports the active sample, and nothing when the cursor is off the plot', () => {
    const { rerender } = render(
      <Chart.Root data={SAMPLES} x="at" width={200} height={100} active={2} format={(v) => `${v}!`}>
        <Chart.Line series="remote" label="Distant" />
        <Chart.Tooltip />
      </Chart.Root>,
    );
    expect(screen.getByText('30s')).toBeTruthy();
    expect(screen.getByText('3!')).toBeTruthy();
    rerender(
      <Chart.Root data={SAMPLES} x="at" width={200} height={100} active={null}>
        <Chart.Line series="remote" label="Distant" />
        <Chart.Tooltip />
      </Chart.Root>,
    );
    expect(screen.queryByText('30s')).toBeNull();
  });

  it('stands a stacked bar on the one declared before it', () => {
    const { container } = render(
      <Chart.Root data={[{ films: 2, tv: 2 }]} width={200} height={100}>
        <Chart.Bar series="films" />
        <Chart.Bar series="tv" stack />
      </Chart.Root>,
    );
    const [films, tv] = paths(container).map((path) => path.getAttribute('d') ?? '');
    expect(films).toBe('M38 50L162 50L162 96Q162 100,158 100L42 100Q38 100,38 96Z');
    expect(tv).toBe('M38 4Q38 0,42 0L158 0Q162 0,162 4L162 50L38 50Z');
  });

  it('rounds the ends of a stacked column and leaves the join square', () => {
    const corners = (data: Record<string, number>) => {
      cleanup();
      const { container } = render(
        <Chart.Root data={[data]} width={200} height={100}>
          <Chart.Bar series="films" />
          <Chart.Bar series="tv" stack />
        </Chart.Root>,
      );
      return paths(container).map((path) => (path.getAttribute('d')?.match(/Q/g) ?? []).length);
    };
    expect(corners({ films: 2, tv: 2 })).toEqual([2, 2]);
    expect(corners({ films: 2, tv: 0 })).toEqual([4]);
    expect(corners({ films: 0, tv: 2 })).toEqual([4]);
  });

  it('refuses a part written outside a Root', () => {
    expect(() => render(<Chart.Legend />)).toThrow('<Chart.Legend> must be used inside');
  });
});
