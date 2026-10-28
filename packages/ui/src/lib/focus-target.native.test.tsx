// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ isTV: true, OS: 'ios' }));
vi.mock('react-native', () => ({
  Platform: platform,
  StyleSheet: {
    absoluteFill: {},
    flatten: (style: unknown) => (Array.isArray(style) ? Object.assign({}, ...style) : style),
  },
}));
vi.mock('./focus-card', () => ({ HAS_FOCUS_CARD: true, FocusCard: () => null }));

async function load(os: string) {
  platform.OS = os;
  vi.resetModules();
  const target = await import('./focus-target');
  const native = await import('./native-focus');
  return { target, native };
}

async function focusOn(os: string, focused: boolean) {
  const { target, native } = await load(os);
  const root = renderHook(() => native.useNativeFocusHost());
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(native.NativeFocusProvider, { value: root.result.current.host }, children);
  return renderHook(() => target.useFocusTarget(focused, 12, 'host'), { wrapper }).result.current;
}

describe('the focus rule on Apple TV', () => {
  it('lets tvOS focus exactly the focused control, without React Native tilting it too', async () => {
    const target = await focusOn('ios', true);

    expect(target.hostProps).toMatchObject({
      focusable: true,
      hasTVPreferredFocus: true,
      tvParallaxProperties: { enabled: false },
    });
  });

  it('keeps an unfocused control away from tvOS focus', async () => {
    const target = await focusOn('ios', false);

    expect(target.hostProps).toMatchObject({ focusable: false, hasTVPreferredFocus: false });
  });

  it('lays the focus card over the control and leaves Select to the focus owner', async () => {
    const target = await focusOn('ios', true);

    expect(target.overlay).not.toBeNull();
    expect(target.remoteSelects).toBe(true);
  });
});

describe('the focus rule elsewhere', () => {
  it('changes nothing on Android TV', async () => {
    const target = await focusOn('android', true);

    expect(target).toEqual({ hostProps: null, overlay: null, remoteSelects: false });
  });
});

describe('radiusOf', () => {
  it('reads the radius a style declares, through an array', async () => {
    const { target } = await load('ios');

    expect(target.radiusOf([{ padding: 4 }, { borderRadius: 18 }])).toBe(18);
    expect(target.radiusOf({ padding: 4 })).toBe(0);
  });
});
