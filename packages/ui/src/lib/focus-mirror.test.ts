// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const scrollY = Object.getOwnPropertyDescriptor(window, 'scrollY');
const undo: (() => void)[] = [];

async function load() {
  vi.resetModules();
  return import('./focus-mirror');
}

function control(parent: HTMLElement = document.body): HTMLElement {
  const el = document.createElement('div');
  el.tabIndex = -1;
  parent.append(el);
  return el;
}

function redelivering(redeliverKey: (event: KeyboardEvent) => void): void {
  window.addEventListener('keydown', redeliverKey, true);
  undo.push(() => window.removeEventListener('keydown', redeliverKey, true));
}

function heard(target: EventTarget, answer?: (event: KeyboardEvent) => void): KeyboardEvent[] {
  const events: KeyboardEvent[] = [];
  const listener = (event: Event) => {
    events.push(event as KeyboardEvent);
    answer?.(event as KeyboardEvent);
  };
  target.addEventListener('keydown', listener);
  undo.push(() => target.removeEventListener('keydown', listener));
  return events;
}

function keydown(key: string, keyCode?: number): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  if (keyCode !== undefined) Object.defineProperty(event, 'keyCode', { value: keyCode });
  return event;
}

const codeOf = (event: KeyboardEvent) => (event as { keyCode: number }).keyCode;

afterEach(() => {
  for (const step of undo.splice(0)) step();
  vi.restoreAllMocks();
  if (scrollY) Object.defineProperty(window, 'scrollY', scrollY);
  document.body.innerHTML = '';
});

describe('mirrorFocus', () => {
  it('hands the document focus to the control the navigator focused', async () => {
    const { mirrorFocus } = await load();
    const el = control();

    mirrorFocus(el);

    expect(document.activeElement).toBe(el);
  });

  it('lets a control the browser would not focus take the focus without a tab stop', async () => {
    const { mirrorFocus } = await load();
    const el = document.createElement('div');
    document.body.append(el);

    mirrorFocus(el);

    expect(document.activeElement).toBe(el);
    expect(el.getAttribute('tabindex')).toBe('-1');
  });

  it('keeps the tab stop a control already has', async () => {
    const { mirrorFocus } = await load();
    const el = document.createElement('div');
    el.tabIndex = 0;
    document.body.append(el);

    mirrorFocus(el);

    expect(el.getAttribute('tabindex')).toBe('0');
  });

  it('remembers which control it handed the focus to', async () => {
    const { isMirrored, mirrorFocus } = await load();
    const el = control();
    const other = control();

    mirrorFocus(el);

    expect(isMirrored(el)).toBe(true);
    expect(isMirrored(other)).toBe(false);
  });

  it('leaves a field that holds the caret alone', async () => {
    const { mirrorFocus } = await load();
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();

    mirrorFocus(control());

    expect(document.activeElement).toBe(field);
  });

  it('gives the focus back to the page when the pointer moves the ring', async () => {
    const { isMirrored, mirrorFocus } = await load();
    const held = control();
    mirrorFocus(held);
    window.dispatchEvent(new MouseEvent('mousemove'));

    mirrorFocus(control());

    expect(document.activeElement).toBe(document.body);
    expect(isMirrored(held)).toBe(false);
  });

  it('ignores a view that is not a DOM element', async () => {
    const { mirrorFocus } = await load();
    const held = control();
    held.focus();

    mirrorFocus({ focus: () => undefined });

    expect(document.activeElement).toBe(held);
  });

  it('asks the engine not to scroll where the engine can be asked', async () => {
    const { mirrorFocus } = await load();
    const el = control();
    const seen: FocusOptions[] = [];

    const focus = vi
      .spyOn(HTMLElement.prototype, 'focus')
      .mockImplementation((options?: FocusOptions) => {
        seen.push({ ...options });
      });

    mirrorFocus(el);

    expect(focus.mock.contexts.at(-1)).toBe(el);
    expect(seen.at(-1)).toEqual({ preventScroll: true });
  });

  it('keeps every scroller where it was on an engine that scrolls to the focus', async () => {
    const { mirrorFocus } = await load();
    const scroller = document.createElement('div');
    document.body.append(scroller);
    scroller.scrollTop = 120;
    const el = control(scroller);

    const focus = HTMLElement.prototype.focus;
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement) {
      if (this === el) scroller.scrollTop = 0;
      focus.call(this);
    });

    mirrorFocus(el);

    expect(scroller.scrollTop).toBe(120);
    expect(document.activeElement).toBe(el);
  });

  it('puts the window back where it was on the same engine', async () => {
    const { mirrorFocus } = await load();
    const el = control();

    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement) {
      if (this === el) Object.defineProperty(window, 'scrollY', { value: 300, configurable: true });
    });

    mirrorFocus(el);

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });
});

describe('redeliverKey', () => {
  it('hands a key on the mirrored control to the page instead', async () => {
    const { mirrorFocus, redeliverKey } = await load();
    const el = control();
    mirrorFocus(el);
    redelivering(redeliverKey);
    const onControl = heard(el);
    const onPage = heard(document);

    el.dispatchEvent(keydown('Enter'));

    expect(onControl).toHaveLength(0);
    expect(onPage.map((event) => [event.target, event.key])).toEqual([[document.body, 'Enter']]);
  });

  it('keeps a key the page refused refused', async () => {
    const { mirrorFocus, redeliverKey } = await load();
    const el = control();
    mirrorFocus(el);
    redelivering(redeliverKey);
    heard(document, (event) => event.preventDefault());
    const key = keydown('ArrowDown');

    el.dispatchEvent(key);

    expect(key.defaultPrevented).toBe(true);
  });

  it('carries the code a remote with no key name sends', async () => {
    const { mirrorFocus, redeliverKey } = await load();
    const el = control();
    mirrorFocus(el);
    redelivering(redeliverKey);
    const onPage = heard(document);

    el.dispatchEvent(keydown('', 13));

    expect(onPage.map(codeOf)).toEqual([13]);
  });

  it('leaves a key on any other element where it landed', async () => {
    const { mirrorFocus, redeliverKey } = await load();
    mirrorFocus(control());
    const other = control();
    redelivering(redeliverKey);
    const onOther = heard(other);

    other.dispatchEvent(keydown('Enter'));

    expect(onOther).toHaveLength(1);
  });
});
