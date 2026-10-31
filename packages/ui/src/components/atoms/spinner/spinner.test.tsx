// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Spinner } from './spinner';

afterEach(cleanup);

const RENDERER_RESET = /^css-/;

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
  it('paints its arc from one rule alone, so a compiled track can never cover it', () => {
    render(<Spinner color="accentInk" />);

    const ring = screen.getByRole('progressbar');

    expect(rulesSetting('border-top-color', ring)).toHaveLength(1);
    expect(rulesSetting('border-right-color', ring)).toHaveLength(1);
  });
});
