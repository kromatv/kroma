// Test helpers for anything that renders kit components.
//
// A <Focusable> is a node of the spatial navigator, and a node needs a navigator
// - the router gives every screen one through <FocusScope>. A test that renders
// a control on its own has no router, so it mounts the same scope here.
//
// It provides translations for the same reason. `useT()` THROWS outside an
// <I18nProvider>, which is not a bug: a component that renders a string with no
// locale to render it in is a real mistake in an app. But it means the player
// chrome, the hints and the dialogs cannot be rendered by a test - or by the
// workbench's story smoke test - without one. So this helper gives a tree
// everything a real screen would: a navigator and a language.
//
// Kept out of the kit's public surface: this is for tests, not for screens.

import { act, type ReactElement } from 'react';
import type { LayoutChangeEvent, LayoutRectangle } from 'react-native';
import { webDocument } from './lib/dom';
import { FocusScope } from './lib/focus-scope';
import { I18nProvider } from './services/i18n';

/** Whether this screen already has a focus owner, and how a test says one has
 * arrived. An app can only assert "the new screen gets to choose again" through
 * these: `autoFocus` is honoured or ignored on the strength of that one flag
 * (see lib/focus-entry), and no rendered output shows it. */
export { focusSettled, markFocusSettled } from './lib/focus-entry';

const kebab = (property: string) => property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function declaredByClass(el: Element, property: string): string | null {
  const classes = [...el.classList].map((name) => `.${name}`);
  const doc = webDocument();
  if (classes.length === 0 || !doc) return null;
  let found: string | null = null;
  for (const sheet of doc.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (!(rule instanceof CSSStyleRule) || !classes.includes(rule.selectorText)) continue;
      const value = rule.style.getPropertyValue(property);
      if (value) found = value;
    }
  }
  return found;
}

/** What an element declares for `property`, inline or through the classes its
 * styles compiled to, as written: a control paints with classes, so `el.style`
 * reads nothing of it, and jsdom's computed style drops `z-index` and every
 * `var()`. Null when nothing declares it. */
export function declared(el: Element, property: string): string | null {
  const name = kebab(property);
  const inline = (el as HTMLElement).style?.getPropertyValue(name);
  return inline || declaredByClass(el, name);
}

/** Whether an element wears the focus ring: the outline the kit draws around
 * the control that has the focus (see tokens/effects). */
export function wearsRing(el: Element | null | undefined): boolean {
  return el instanceof HTMLElement && declared(el, 'outline-style') === 'solid';
}

/** Wrap a tree in the same navigator and locale a real screen runs inside.
 * English, because an assertion reads better against the words in the test. */
export function onScreen(ui: ReactElement): ReactElement {
  return (
    <I18nProvider locale="en">
      <FocusScope>{ui}</FocusScope>
    </I18nProvider>
  );
}

/** The node under `root` that measures itself, i.e. the one react-native-web
 * gave an `onLayout`. Throws unless there is exactly one, so a caller measuring
 * "the" box cannot silently start measuring a different one. */
export function measuring(root: Element): Element {
  const boxes = [...root.querySelectorAll('div')].filter(
    (el) => (el as { __reactLayoutHandler?: unknown }).__reactLayoutHandler !== undefined,
  );
  if (boxes.length !== 1) {
    throw new Error(`expected one node that measures itself, found ${boxes.length}`);
  }
  return boxes[0] as Element;
}

/** Hand a rendered node the box a browser would have measured, firing the
 * `onLayout` it was given. react-native-web reports layout through a
 * ResizeObserver, which jsdom does not implement, so nothing a component
 * computes from its own size happens in a test until this says it did. */
export function layout(node: Element, box: Partial<LayoutRectangle>): void {
  const fire = (node as { __reactLayoutHandler?: (event: LayoutChangeEvent) => void })
    .__reactLayoutHandler;
  if (!fire) throw new Error('this node has no onLayout');
  act(() => {
    fire({
      nativeEvent: { layout: { x: 0, y: 0, width: 0, height: 0, ...box } },
      timeStamp: Date.now(),
    } as LayoutChangeEvent);
  });
}
