// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { Animated } from 'react-native';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { onScreen } from '#ui/testing';
import { UpNextSheet } from './up-next-sheet';
import { DATA } from './up-next-sheet.fixtures';

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

afterEach(() => {
  vi.restoreAllMocks();
});

function sheet(open: boolean) {
  return render(
    onScreen(
      <UpNextSheet
        data={DATA}
        open={open}
        revealed
        onOpen={() => {}}
        onClose={() => {}}
        onPlay={() => {}}
      />,
    ),
  );
}

describe('the sheet rising and parking', () => {
  it('never asks a browser for the native driver it does not have', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender } = sheet(false);
    rerender(
      onScreen(
        <UpNextSheet
          data={DATA}
          open
          revealed
          onOpen={() => {}}
          onClose={() => {}}
          onPlay={() => {}}
        />,
      ),
    );

    const said = [...warn.mock.calls, ...error.mock.calls].map((args) => String(args[0]));
    expect(said.filter((line) => line.includes('useNativeDriver'))).toEqual([]);
  });

  it('travels on a CSS transition rather than a per-frame JS timing', () => {
    const timing = vi.spyOn(Animated, 'timing');

    const { container } = sheet(false);

    expect(timing).not.toHaveBeenCalled();
    expect(container.querySelector('[style*="transition-property: transform"]')).toBeTruthy();
  });
});
