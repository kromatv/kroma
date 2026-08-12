// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PinField } from './pin-field';

afterEach(cleanup);

// A dot is a leaf: the row and the group both hold children, nothing else does.
const dots = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('div')).filter((el) => el.children.length === 0);

function press(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

describe('PinField', () => {
  it('draws one dot per digit and no text entry', () => {
    const { container } = render(<PinField maxLength={6} />);
    expect(dots(container)).toHaveLength(6);
    expect(container.querySelector('input')).toBeNull();
  });

  it('names the row, which is all a code of faces has to be named by', () => {
    const { container } = render(<PinField maxLength={4} label="Code PIN" />);
    const group = container.querySelector('[role="group"]') as HTMLElement;
    expect(group.getAttribute('aria-label')).toBe('Code PIN');
  });

  it('fills a dot per digit held', () => {
    const { container } = render(<PinField maxLength={4} value="12" />);
    const filled = dots(container).map((el) => getComputedStyle(el).backgroundColor);
    expect(new Set(filled).size).toBe(2);
    expect(filled[0]).toBe(filled[1]);
    expect(filled[2]).toBe(filled[3]);
  });

  it('takes a typed code and a backspace where the shell has a keyboard', () => {
    const onValueChange = vi.fn();
    render(<PinField maxLength={4} physicalKeyboard onValueChange={onValueChange} />);

    press('1');
    press('2');
    expect(onValueChange).toHaveBeenLastCalledWith('12');

    press('Backspace');
    expect(onValueChange).toHaveBeenLastCalledWith('1');
  });

  it('hears nothing without a keyboard, or while it is disabled', () => {
    const onValueChange = vi.fn();
    const view = render(<PinField maxLength={4} onValueChange={onValueChange} />);
    press('1');
    expect(onValueChange).not.toHaveBeenCalled();

    view.rerender(
      <PinField maxLength={4} physicalKeyboard disabled onValueChange={onValueChange} />,
    );
    press('1');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('never grows past its length', () => {
    const onValueChange = vi.fn();
    render(<PinField maxLength={2} physicalKeyboard value="12" onValueChange={onValueChange} />);
    press('3');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('reports a complete code once', () => {
    const onComplete = vi.fn();
    const view = render(<PinField maxLength={4} value="123" onComplete={onComplete} />);
    view.rerender(<PinField maxLength={4} value="1234" onComplete={onComplete} />);
    view.rerender(<PinField maxLength={4} value="1234" onComplete={onComplete} />);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('1234');
  });

  it('paints the empty dots red once the code was refused', () => {
    const { container: plain } = render(<PinField maxLength={4} />);
    const quiet = getComputedStyle(dots(plain)[0] as HTMLElement).borderColor;

    cleanup();
    const { container: refused } = render(<PinField maxLength={4} invalid />);
    expect(getComputedStyle(dots(refused)[0] as HTMLElement).borderColor).not.toBe(quiet);
  });
});
