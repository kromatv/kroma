// @vitest-environment jsdom

import { cleanup, fireEvent, render as renderRaw, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onScreen } from '#ui/testing';
import { SegmentedControl } from './segmented-control';

const render = (ui: ReactElement) => renderRaw(onScreen(ui));

afterEach(cleanup);

function Group({
  value,
  onValueChange,
  disabled,
}: Readonly<{ value: string; onValueChange: (v: string) => void; disabled?: string }>) {
  return (
    <SegmentedControl.Root
      value={value}
      onValueChange={onValueChange}
      label="Mode"
      options={[
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B', disabled: disabled === 'b' },
        { value: 'c', label: 'C' },
      ]}
    />
  );
}

describe('SegmentedControl', () => {
  it('is a radiogroup whose segments carry the selection', () => {
    render(<Group value="a" onValueChange={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: 'Mode' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'A' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'B' }).getAttribute('aria-checked')).toBe('false');
  });

  it('steps over a disabled segment rather than selecting it', () => {
    const onValueChange = vi.fn();
    render(<Group value="a" onValueChange={onValueChange} disabled="b" />);

    fireEvent.keyDown(screen.getByRole('radiogroup', { name: 'Mode' }), { key: 'ArrowRight' });

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith('c');
  });

  it('selects the next segment when nothing is disabled', () => {
    const onValueChange = vi.fn();
    render(<Group value="a" onValueChange={onValueChange} />);

    fireEvent.keyDown(screen.getByRole('radiogroup', { name: 'Mode' }), { key: 'ArrowRight' });

    expect(onValueChange).toHaveBeenCalledWith('b');
  });

  it('wraps around the row backwards', () => {
    const onValueChange = vi.fn();
    render(<Group value="a" onValueChange={onValueChange} />);

    fireEvent.keyDown(screen.getByRole('radiogroup', { name: 'Mode' }), { key: 'ArrowLeft' });

    expect(onValueChange).toHaveBeenCalledWith('c');
  });

  it('names the part that was rendered outside its Root', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<SegmentedControl.Item value="a" label="A" />)).toThrow(
      '<SegmentedControl.Item> must be used inside its Root',
    );

    vi.restoreAllMocks();
  });
});
