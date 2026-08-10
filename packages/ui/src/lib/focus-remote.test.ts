// @vitest-environment jsdom
//
// The browser half: the remote arrives as ordinary key events on the document.
//
// Two rules are pinned here because breaking either produces a television that
// looks fine and cannot be driven. ONE focus, and it is the navigator's: a
// click parks DOM focus on whatever was clicked (react-native-web makes every
// pressable tabbable) and the CSS focus rules then draw a second ring nothing
// on a remote can move, so the next key takes that focus back. And Tab is
// reading order rather than the browser's own focus walk, which would move that
// second focus to a different control from the navigator's.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({
  subscribe: null as ((handle: (direction: string) => void) => () => void) | null,
  unsubscribe: null as ((stop: () => void) => void) | null,
}));

vi.mock('react-tv-space-navigation', () => ({
  Directions: {
    UP: 'up',
    DOWN: 'down',
    LEFT: 'left',
    RIGHT: 'right',
    ENTER: 'enter',
  },
  SpatialNavigation: {
    configureRemoteControl: (control: {
      remoteControlSubscriber: (handle: (direction: string) => void) => () => void;
      remoteControlUnsubscriber: (stop: () => void) => void;
    }) => {
      nav.subscribe = control.remoteControlSubscriber;
      nav.unsubscribe = control.remoteControlUnsubscriber;
    },
  },
}));

const tab = vi.hoisted(() => ({ walk: vi.fn() }));
vi.mock('./focus-tab', () => ({ walkTab: tab.walk }));

import { configureRemote } from './focus-remote';

/** Wires the remote up and hands back what the navigator would hold. */
function mount() {
  configureRemote();
  const handle = vi.fn();
  const stop = nav.subscribe?.(handle);
  return { handle, stop: stop ?? (() => undefined) };
}

function press(key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init });
  document.dispatchEvent(event);
  return event;
}

/** A focused element of the given tag, as a click would have left it. */
function focus(tag: string, editable = false) {
  const el = document.createElement(tag);
  if (editable) el.setAttribute('contenteditable', 'true');
  if (tag === 'BUTTON' || tag === 'button') el.setAttribute('tabindex', '0');
  document.body.append(el);
  const blur = vi.spyOn(el, 'blur');
  Object.defineProperty(document, 'activeElement', { value: el, configurable: true });
  if (editable) Object.defineProperty(el, 'isContentEditable', { value: true });
  return { el, blur };
}

beforeEach(() => {
  document.body.innerHTML = '';
  tab.walk.mockClear();
  Reflect.deleteProperty(document, 'activeElement');
});

describe('arrow keys', () => {
  it.each([
    ['ArrowUp', 'up'],
    ['ArrowDown', 'down'],
    ['ArrowLeft', 'left'],
    ['ArrowRight', 'right'],
    ['Enter', 'enter'],
  ])('drives the navigator on %s', (key, direction) => {
    const { handle, stop } = mount();
    press(key);
    expect(handle).toHaveBeenCalledWith(direction);
    stop();
  });

  it.each([
    ['Up', 'up'],
    ['Down', 'down'],
    ['Left', 'left'],
    ['Right', 'right'],
  ])('accepts %s, which is how Tizen and webOS spell it', (key, direction) => {
    const { handle, stop } = mount();
    press(key);
    expect(handle).toHaveBeenCalledWith(direction);
    stop();
  });

  // Without this a television's browser scrolls the page and the focused
  // control walks out of the viewport.
  it('takes the key from the browser', () => {
    const { stop } = mount();
    expect(press('ArrowDown').defaultPrevented).toBe(true);
    stop();
  });

  it('ignores a key that is not the remote', () => {
    const { handle, stop } = mount();
    const event = press('a');
    expect(handle).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    stop();
  });

  it('stops listening once the navigator unsubscribes', () => {
    const { handle, stop } = mount();
    nav.unsubscribe?.(stop);
    press('ArrowDown');
    expect(handle).not.toHaveBeenCalled();
  });
});

describe('the stray focus a click leaves behind', () => {
  it('blurs a control the navigator does not own', () => {
    const { blur } = focus('button');
    const { stop } = mount();
    press('ArrowDown');
    expect(blur).toHaveBeenCalled();
    stop();
  });

  it.each(['input', 'textarea', 'select'])('leaves a %s alone: the caret belongs there', (tag) => {
    const { blur } = focus(tag);
    const { stop } = mount();
    press('ArrowDown');
    expect(blur).not.toHaveBeenCalled();
    stop();
  });

  it('leaves a contenteditable alone for the same reason', () => {
    const { blur } = focus('div', true);
    const { stop } = mount();
    press('ArrowDown');
    expect(blur).not.toHaveBeenCalled();
    stop();
  });

  it('does nothing when the focus is already nowhere', () => {
    const { handle, stop } = mount();
    // jsdom parks the focus on <body> with nothing focused.
    expect(() => press('ArrowDown')).not.toThrow();
    expect(handle).toHaveBeenCalledWith('down');
    stop();
  });
});

describe('Tab', () => {
  it('walks reading order through the navigator, never the browser', () => {
    const { handle, stop } = mount();
    const event = press('Tab');
    expect(event.defaultPrevented).toBe(true);
    expect(tab.walk).toHaveBeenCalledTimes(1);
    expect(tab.walk.mock.calls[0]?.[0]).toBe(handle);
    expect(tab.walk.mock.calls[0]?.[2]).toBe(false);
    // The navigator moved the focus, so nothing else may have been sent.
    expect(handle).not.toHaveBeenCalled();
    stop();
  });

  it('walks backwards on Shift+Tab', () => {
    const { stop } = mount();
    press('Tab', { shiftKey: true });
    expect(tab.walk.mock.calls[0]?.[2]).toBe(true);
    stop();
  });

  it('drops the stray focus first, so the walk starts from the ring', () => {
    const { blur } = focus('button');
    const { stop } = mount();
    press('Tab');
    expect(blur).toHaveBeenCalled();
    stop();
  });
});
