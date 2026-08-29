// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { LayoutChangeEvent } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { layout } from '#ui/testing';

const rn = vi.hoisted(() => ({ os: 'android' as 'android' | 'ios', isTV: true }));

vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>();
  return {
    ...actual,
    // Absent from react-native-web, which is what the runner resolves.
    useTVEventHandler: undefined,
    Platform: {
      ...actual.Platform,
      get OS() {
        return rn.os;
      },
      get isTV() {
        return rn.isTV;
      },
    },
  };
});

afterEach(cleanup);

const TELEVISION = { os: 'android', isTV: true } as const;
const PHONE = { os: 'ios', isTV: false } as const;

// Which dip a control gets is settled when the module loads, so each platform
// needs its own copy of it.
async function control(
  platform: typeof TELEVISION | typeof PHONE,
  props: { onPress?: () => void; onLayout?: (event: LayoutChangeEvent) => void } = {},
) {
  rn.os = platform.os;
  rn.isTV = platform.isTV;
  vi.resetModules();
  const { TouchPressable } = await import('./touch-pressable');
  render(
    <TouchPressable base={[]} a11yState={{}} label="Lire" onPress={() => {}} {...props}>
      {() => null}
    </TouchPressable>,
  );
  return screen.getByLabelText('Lire');
}

const measures = (el: HTMLElement) =>
  Boolean((el as { __reactLayoutHandler?: unknown }).__reactLayoutHandler);

describe('the press dip', () => {
  it('leaves a television flat, where the ring and the focus scale answer the remote', async () => {
    expect((await control(TELEVISION)).style.transform).toBe('');
  });

  it('sinks a phone control, which is the touch half of the focus scale', async () => {
    expect((await control(PHONE)).style.transform).toBe('scale(1)');
  });

  it('reads no layout on a television, having no size to dip by', async () => {
    expect(measures(await control(TELEVISION))).toBe(false);
  });

  it('reads the box on a phone, so a row and a button travel the same pixels', async () => {
    expect(measures(await control(PHONE))).toBe(true);
  });
});

describe('what a television keeps', () => {
  it('runs the caller’s own onLayout, which the dip only rode along with', async () => {
    const onLayout = vi.fn();
    layout(await control(TELEVISION, { onLayout }), { width: 900, height: 60 });
    expect(onLayout).toHaveBeenCalledOnce();
  });

  it('answers a click, which is what an air mouse on Android TV sends', async () => {
    const onPress = vi.fn();
    fireEvent.click(await control(TELEVISION, { onPress }));
    expect(onPress).toHaveBeenCalledOnce();
  });
});
