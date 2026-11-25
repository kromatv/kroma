// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screenText, snapshot } from '#ui/lib/inspect';
import { onScreen } from '#ui/testing';
import { OtpField, type OtpFieldRootProps } from './otp-field.component';

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
});

afterEach(cleanup);

const show = (props: OtpFieldRootProps) =>
  render(onScreen(<OtpField.Root maxLength={4} physicalKeyboard {...props} />)).container;

function type(container: HTMLElement, text: string) {
  const input = container.querySelector('input');
  if (!input) {
    throw new Error('no entry mounted');
  }
  fireEvent.change(input, { target: { value: text } });
}

const field = () => snapshot().find((control) => control.kind === 'otp-field');

const call = (action: string, ...args: unknown[]) =>
  act({ steps: [{ ref: field()?.ref ?? '', action, args }] });

describe('the code of an OtpField', () => {
  it('asks the app for a typed code it owns, and shows only what the app gave', () => {
    const onValueChange = vi.fn();
    const container = show({ value: '12', onValueChange });

    type(container, '123');

    expect(onValueChange).toHaveBeenCalledWith('123', expect.objectContaining({ source: 'user' }));
    expect(container.textContent).toBe('12');
  });

  it('stays as it was when the app cancels the change', () => {
    const container = show({ onValueChange: (_next, details) => details.cancel() });

    type(container, '12');

    expect(container.textContent).toBe('');
  });

  it('reads as a secret to a tool, with the action that types into it', () => {
    const container = show({ defaultValue: '4821' });

    const text = screenText();

    expect(field()).toMatchObject({
      name: 'OtpField.Root',
      state: { value: '[secret]' },
      actions: ['setValue', 'type'],
    });
    expect(text).not.toContain('4821');
    expect(container.textContent).toBe('4821');
  });

  it('runs what a tool types through the pattern and the length', async () => {
    const onValueChange = vi.fn();
    const container = show({ onValueChange });

    await call('type', '12 a3456');

    expect(onValueChange).toHaveBeenCalledWith(
      '1234',
      expect.objectContaining({ reason: 'type', source: 'tool' }),
    );
    expect(container.textContent).toBe('1234');
  });

  it('completes once when a tool fills the code', async () => {
    const onComplete = vi.fn();
    show({ onComplete });

    await call('type', '1234');
    await call('type', '12345');

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('1234');
  });

  it('refuses a tool’s call while it is disabled', async () => {
    const container = show({ disabled: true });

    const report = await call('type', '1234');

    expect(report.ok).toBe(false);
    expect(container.textContent).toBe('');
  });
});
