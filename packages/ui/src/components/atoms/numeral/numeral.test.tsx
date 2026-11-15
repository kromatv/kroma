// @vitest-environment jsdom

import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { onScreen } from '#ui/testing';
import { createStyleTestHost } from '#ui/testing-style';
import { Numeral, numeralColumn, numeralWidth } from './numeral';
import { NUMERAL_BOX, NUMERAL_GLYPHS } from './numeral-glyphs.gen';

const styleHost = createStyleTestHost();

afterEach(cleanup);

const outlines = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('path')).filter(
    (path) => path.getAttribute('fill') === 'none',
  );

function weightAt(height: number): number {
  const { container } = styleHost.render(
    onScreen(<Numeral value={3} height={height} thickness={4} />),
  );
  const path = outlines(container)[0];
  const scale = (height - 8) / NUMERAL_BOX;
  cleanup();
  return (Number(path?.getAttribute('stroke-width')) * scale) / 2;
}

describe('Numeral', () => {
  it('draws one outline per digit, in the order they are read', () => {
    const { container } = styleHost.render(onScreen(<Numeral value={10} height={120} />));

    const drawn = outlines(container).map((path) => path.getAttribute('d'));

    expect(drawn).toEqual([NUMERAL_GLYPHS[1]?.d, NUMERAL_GLYPHS[0]?.d]);
  });

  it('fills each digit over its own outline, so the seams of the face do not show', () => {
    const { container } = styleHost.render(
      onScreen(<Numeral value={8} height={120} thickness={3} />),
    );

    const [outline, cover] = [...container.querySelectorAll('path')];

    expect(outline?.getAttribute('fill')).toBe('none');
    expect(cover?.getAttribute('d')).toBe(outline?.getAttribute('d'));
    expect(cover?.getAttribute('fill')).not.toBe('none');
    expect(cover?.getAttribute('stroke')).toBeNull();
  });

  it('keeps its outline the same weight at every height', () => {
    expect(weightAt(60)).toBeCloseTo(4);
    expect(weightAt(240)).toBeCloseTo(4);
  });

  it('takes the height it is given and the width its digits need', () => {
    const { container } = styleHost.render(onScreen(<Numeral value={10} height={120} />));

    const svg = container.querySelector('svg');

    expect(svg?.getAttribute('height')).toBe('120');
    expect(svg?.getAttribute('width')).toBe(String(numeralWidth(10, 120)));
  });

  it('needs more room for two digits than for one', () => {
    expect(numeralWidth(10, 120)).toBeGreaterThan(numeralWidth(8, 120));
    expect(numeralWidth(1, 120)).toBeLessThan(numeralWidth(8, 120));
  });

  it('draws a number too wide for its column smaller, so ten stands where one digit does', () => {
    const column = numeralColumn(120);
    const { container } = styleHost.render(
      onScreen(<Numeral value={10} height={120} maxWidth={column} />),
    );

    const svg = container.querySelector('svg');

    expect(Number(svg?.getAttribute('width'))).toBeLessThanOrEqual(column);
    expect(Number(svg?.getAttribute('width'))).toBeGreaterThan(column - 4);
    expect(Number(svg?.getAttribute('height'))).toBeLessThan(120);
  });

  it('leaves a number that fits its column at the height it was given', () => {
    const column = numeralColumn(120);
    const { container } = styleHost.render(
      onScreen(<Numeral value={1} height={120} maxWidth={column} />),
    );

    expect(container.querySelector('svg')?.getAttribute('height')).toBe('120');
  });

  it('reserves the column of the widest digit', () => {
    const column = numeralColumn(120);

    for (let digit = 0; digit <= 9; digit += 1) {
      expect(numeralWidth(digit, 120)).toBeLessThanOrEqual(column);
    }
    expect(numeralWidth(10, 120)).toBeGreaterThan(column);
  });

  it('names itself only when asked, so a control around it says the number once', () => {
    styleHost.render(onScreen(<Numeral value={3} height={120} label="Number 3" />));

    expect(screen.getByLabelText('Number 3').getAttribute('role')).toBe('img');
  });

  it('draws the whole part of a number and nothing for one that is not a number', () => {
    const { container } = styleHost.render(onScreen(<Numeral value={-4.9} height={120} />));
    const paths = outlines(container);
    cleanup();
    const { container: none } = styleHost.render(
      onScreen(<Numeral value={Number.NaN} height={120} />),
    );

    expect(paths).toHaveLength(1);
    expect(paths[0]?.getAttribute('d')).toBe(NUMERAL_GLYPHS[4]?.d);
    expect(none.querySelector('svg')).toBeNull();
  });

  it('carries all ten digits, each a closed outline', () => {
    expect(NUMERAL_GLYPHS).toHaveLength(10);
    for (const glyph of NUMERAL_GLYPHS) {
      expect(glyph.d.startsWith('M')).toBe(true);
      expect(glyph.d.endsWith('Z')).toBe(true);
      expect(glyph.width).toBeGreaterThan(0);
    }
  });
});
