// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useControllable } from './use-controllable';

afterEach(cleanup);

function Probe({
  value,
  onChange,
}: Readonly<{ value?: string; onChange?: (next: string) => void }>) {
  const [current, set] = useControllable(value, 'start', onChange);
  return (
    <button type="button" onClick={() => set('next')}>
      {current}
    </button>
  );
}

describe('useControllable', () => {
  it('runs itself from the default when no value is passed', () => {
    const onChange = vi.fn();
    render(<Probe onChange={onChange} />);
    expect(screen.getByRole('button').textContent).toBe('start');
    act(() => screen.getByRole('button').click());
    expect(screen.getByRole('button').textContent).toBe('next');
    expect(onChange).toHaveBeenCalledWith('next');
  });

  it('never moves on its own when controlled: the owner decides', () => {
    const onChange = vi.fn();
    render(<Probe value="held" onChange={onChange} />);
    act(() => screen.getByRole('button').click());
    // Reported upward, not applied locally.
    expect(onChange).toHaveBeenCalledWith('next');
    expect(screen.getByRole('button').textContent).toBe('held');
  });
});
