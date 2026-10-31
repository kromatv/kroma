// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Spinner } from './spinner';

afterEach(cleanup);

const RENDERER_RESET = /^css-/;

const EDGES = [
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
];

function rulesSetting(property: string, element: Element): string[] {
  const own = [...element.classList].filter((name) => !RENDERER_RESET.test(name));
  const selectors = new Set(own.map((name) => `.${name}`));
  return [...document.styleSheets]
    .flatMap((sheet) => [...sheet.cssRules])
    .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
    .filter((rule) => selectors.has(rule.selectorText) && rule.style.getPropertyValue(property))
    .map((rule) => rule.selectorText);
}

describe('Spinner', () => {
  it('sets each edge from one rule at most, so a compiled rule can never cover the arc', () => {
    render(<Spinner color="accentInk" />);

    const ring = screen.getByRole('progressbar');
    const views = [ring, ...ring.querySelectorAll('*')];

    for (const view of views) {
      for (const edge of EDGES) expect(rulesSetting(edge, view).length).toBeLessThanOrEqual(1);
    }
  });

  it("draws its track in the arc's own colour, faded under it", () => {
    render(<Spinner color="#ff0000" />);

    const [track, arc] = [...screen.getByRole('progressbar').children];

    expect(getComputedStyle(track as Element).borderRightColor).toBe(
      getComputedStyle(arc as Element).borderTopColor,
    );
    expect(Number(getComputedStyle(track as Element).opacity)).toBeLessThan(1);
    expect(getComputedStyle(arc as Element).opacity).toBe('1');
  });
});
