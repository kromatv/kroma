// The batteries-included wrapper, for callers already using
// @testing-library/react.
//
//   import { measure } from '@kroma/react-audit/react';
//
//   const result = measure(<Keyboard />, { press: 'first' });
//   expect(result.churn).toEqual([]);
//
// It renders, drives one interaction and reads the commits. The core in
// `@kroma/react-audit` does the same without knowing about any renderer, which
// is what to reach for when the interaction is more than one press.
//
// It does NOT unmount: that is `afterEach(cleanup)`'s job, the same as any other
// testing-library render, and it leaves the DOM there to be inspected.

import { fireEvent, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { type Result, record } from './record';

// In the order a person would reach for them. Text entry first: a field is where
// a keystroke goes, and a keystroke is the interaction that usually costs most.
const CONTROLS = [
  'input:not([type=hidden])',
  'textarea',
  '[role="button"]',
  'button',
  '[tabindex]:not([tabindex="-1"])',
  '[role="slider"]',
] as const;

/** The first thing in `roots` a person could press, searching each root in turn. */
function firstControl(
  roots: readonly Element[],
  selectors: readonly string[] = CONTROLS,
): Element | null {
  for (const selector of selectors) {
    for (const root of roots) {
      if (root.matches?.(selector)) return root;
      const found = root.querySelector(selector);
      if (found) return found;
    }
  }
  return null;
}

interface MeasureOptions {
  /** What to press: `'first'` for the first control the view offers (the
   *  default), a CSS selector, or an element you already have. A union naming
   *  the sentinel beside `string` says nothing the compiler can use, so it
   *  lives here where it can be read. */
  press?: string | Element;
  /** Type into the first text field instead of pressing. */
  type?: string;
  /** Anything the two above cannot express. Receives the rendered roots. */
  act?: (roots: readonly Element[]) => void;
}

interface Measured extends Result {
  /** What was actually driven, or null when the view had nothing to drive. A
   *  view with nothing to press is not a finding, it is a view with no controls. */
  drove: Element | null;
  roots: readonly Element[];
}

function resolve(roots: readonly Element[], press: MeasureOptions['press']): Element | null {
  if (press instanceof Element) return press;
  if (typeof press === 'string' && press !== 'first') return firstControl(roots, [press]);
  return firstControl(roots);
}

/** Renders `ui`, drives one interaction, and reports what it cost. */
function measure(ui: ReactElement, options: MeasureOptions = {}): Measured {
  const run = record();
  const container = render(ui).container;
  // A portal lands outside the container, which is where an overlay's DOM
  // actually is, so both count as roots.
  const portals = [...document.body.children].filter((child) => child !== container);
  const roots = [...container.children, ...portals];

  let drove: Element | null = null;
  if (options.act) {
    options.act(roots);
  } else if (options.type !== undefined) {
    drove = firstControl(roots, ['input:not([type=hidden])', 'textarea']);
    if (drove) fireEvent.change(drove, { target: { value: options.type } });
  } else {
    drove = resolve(roots, options.press ?? 'first');
    if (drove) fireEvent.click(drove);
  }

  return { ...run.stop(), drove, roots };
}

export type { Measured, MeasureOptions };
export { firstControl, measure };
