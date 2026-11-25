// @vitest-environment jsdom

import { cleanup, render, act as settle } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screenText, snapshot } from '#ui/lib/inspect';
import { onScreen } from '#ui/testing';
import { PinField, type PinFieldProps } from './pin-field.component';

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
});

afterEach(cleanup);

const show = (props: PinFieldProps) =>
  render(onScreen(<PinField maxLength={4} physicalKeyboard {...props} />)).container;

function press(key: string) {
  settle(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

const dots = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('div')).filter((el) => el.children.length === 0);

const filled = (container: HTMLElement) => {
  const empty = getComputedStyle(dots(container).at(-1) ?? container).backgroundColor;
  return dots(container).filter((dot) => getComputedStyle(dot).backgroundColor !== empty).length;
};

const control = (kind: string) => snapshot().find((entry) => entry.kind === kind);

const call = (kind: string, action: string, ...args: unknown[]) =>
  act({ steps: [{ ref: control(kind)?.ref ?? '', action, args }] });

describe('the code of a PinField', () => {
  it('fills a dot for each digit typed', () => {
    const container = show({});

    press('1');
    press('2');

    expect(filled(container)).toBe(2);
  });

  it('asks the app for a digit while the app owns the code, and waits for it', () => {
    const onValueChange = vi.fn();
    const container = show({ value: '1', onValueChange });

    press('2');

    expect(onValueChange).toHaveBeenCalledWith('12', expect.objectContaining({ source: 'user' }));
    expect(filled(container)).toBe(1);
  });

  it('keeps the code when the app cancels the change', () => {
    const container = show({ onValueChange: (_next, details) => details.cancel() });

    press('1');

    expect(filled(container)).toBe(0);
  });

  it('reads as a secret to a tool, on the field and on the row it draws', () => {
    show({ defaultValue: '4821' });

    const text = screenText();

    expect(control('pin-field')).toMatchObject({
      name: 'PinField',
      state: { value: '[secret]' },
      actions: ['setValue', 'append', 'erase'],
    });
    expect(control('otp-field')?.state).toEqual({ value: '[secret]' });
    expect(text).not.toContain('4821');
  });

  it('takes a digit from a tool and refuses anything else', async () => {
    const onValueChange = vi.fn();
    const container = show({ onValueChange });

    await call('pin-field', 'append', '7');
    await call('pin-field', 'append', 'x');

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith('7', expect.objectContaining({ source: 'tool' }));
    expect(filled(container)).toBe(1);
  });

  it('keeps the reason of a change made on the row it draws', async () => {
    const onValueChange = vi.fn();
    show({ onValueChange });

    await call('otp-field', 'type', '42');

    expect(onValueChange).toHaveBeenCalledWith('42', expect.objectContaining({ reason: 'type' }));
  });

  it('refuses a tool’s call while it is disabled', async () => {
    const container = show({ disabled: true });

    const report = await call('pin-field', 'append', '1');

    expect(report.ok).toBe(false);
    expect(filled(container)).toBe(0);
  });
});
