// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ isTV: true, OS: 'ios' }));
vi.mock('react-native', () => ({ Platform: platform }));

type Module = typeof import('./native-focus');

async function load(os: string, isTV = true): Promise<Module> {
  platform.OS = os;
  platform.isTV = isTV;
  vi.resetModules();
  return import('./native-focus');
}

function wrapperFor(mod: Module, host: ReturnType<Module['useNativeFocusHost']>['host']) {
  return ({ children }: { children: ReactNode }) =>
    createElement(mod.NativeFocusProvider, { value: host }, children);
}

describe('native focus on Apple TV', () => {
  it('makes the focused control the one view tvOS may focus, and asks tvOS to focus it', async () => {
    const mod = await load('ios');
    const root = renderHook(() => mod.useNativeFocusHost());

    const control = renderHook(({ on }) => mod.useNativeFocus(on), {
      initialProps: { on: true },
      wrapper: wrapperFor(mod, root.result.current.host),
    });

    expect(control.result.current).toBe(true);
    expect(root.result.current.held).toBe(true);
  });

  it('gives tvOS focus back to the key host once no control holds it', async () => {
    const mod = await load('ios');
    const root = renderHook(() => mod.useNativeFocusHost());
    const control = renderHook(({ on }) => mod.useNativeFocus(on), {
      initialProps: { on: true },
      wrapper: wrapperFor(mod, root.result.current.host),
    });

    act(() => control.rerender({ on: false }));

    expect(control.result.current).toBe(false);
    expect(root.result.current.held).toBe(false);
  });

  it('keeps the key host away while focus passes from one control to the next', async () => {
    const mod = await load('ios');
    const root = renderHook(() => mod.useNativeFocusHost());
    const wrapper = wrapperFor(mod, root.result.current.host);
    const first = renderHook(({ on }) => mod.useNativeFocus(on), {
      initialProps: { on: true },
      wrapper,
    });
    const second = renderHook(({ on }) => mod.useNativeFocus(on), {
      initialProps: { on: false },
      wrapper,
    });

    act(() => {
      first.rerender({ on: false });
      second.rerender({ on: true });
    });

    expect(root.result.current.held).toBe(true);
  });
});

describe('native focus elsewhere', () => {
  it('adds nothing to a control on Android TV', async () => {
    const mod = await load('android');

    const control = renderHook(() => mod.useNativeFocus(true));

    expect(control.result.current).toBe(false);
  });

  it('adds nothing on an iPhone', async () => {
    const mod = await load('ios', false);

    const control = renderHook(() => mod.useNativeFocus(true));

    expect(control.result.current).toBe(false);
  });
});
