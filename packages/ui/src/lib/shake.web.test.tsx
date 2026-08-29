// @vitest-environment jsdom
//
// `./shake` under the project that picks the `.web` twin, which is the only
// resolution its one caller ever gets.

import { cleanup, render } from '@testing-library/react';
import { AccessibilityInfo, Animated } from 'react-native';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { useShake } from './shake';

// Two react-native-web facts this file is built on: it picks a mock Animated
// that never touches the driver when NODE_ENV is `test`, and it warns about the
// missing driver ONCE per module registry. So the env is put back to what a
// browser bundle sees before anything imports it, and nothing else in this file
// renders first.
vi.hoisted(() => {
  vi.stubEnv('NODE_ENV', 'development');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

function Row({ at }: Readonly<{ at: number }>) {
  const shake = useShake(at);
  return <Animated.View style={shake} />;
}

const row = (container: HTMLElement) => container.firstElementChild as HTMLElement;

function refuse() {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const rendered = render(<Row at={0} />);
  rendered.rerender(<Row at={1} />);
  return rendered;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('a refused PIN on the browser targets', () => {
  it('never asks a browser for the native driver it does not have', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    refuse();

    const said = [...warn.mock.calls, ...error.mock.calls].map((args) => String(args[0]));
    expect(said.filter((line) => line.includes('useNativeDriver'))).toEqual([]);
  });

  it('wobbles on a CSS transition rather than a per-frame JS timing', () => {
    const timing = vi.spyOn(Animated, 'timing');

    const { container } = refuse();

    expect(timing).not.toHaveBeenCalled();
    expect(row(container).style.transitionProperty).toBe('transform');
    expect(row(container).style.transform).toBe('translateX(-8px)');
  });
});
