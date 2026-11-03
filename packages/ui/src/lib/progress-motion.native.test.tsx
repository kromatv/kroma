// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Animated } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProgressRing } from '#ui/components/atoms/progress-ring';

vi.mock('#ui/lib/svg', () => ({
  Svg: ({ children }: { children?: ReactNode }) => <svg>{children}</svg>,
  Circle: () => <circle />,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the ring on native', () => {
  it('eases the arc to a new value', () => {
    const timing = vi.spyOn(Animated, 'timing');
    const { rerender } = render(<ProgressRing value={0.2} />);

    rerender(<ProgressRing value={0.4} />);

    expect(timing).toHaveBeenCalledTimes(1);
  });

  it('runs no animation for a value it is told not to ease', () => {
    const timing = vi.spyOn(Animated, 'timing');
    const { rerender } = render(<ProgressRing value={0.2} eased={false} />);

    rerender(<ProgressRing value={0.4} eased={false} />);

    expect(timing).not.toHaveBeenCalled();
  });
});
