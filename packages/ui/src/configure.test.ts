// @vitest-environment jsdom

import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { createStyleTestHost } from '#ui/testing-style';
import { configureKit, type KitConfig, KitProvider } from './configure';
import { createTheme, KROMA, useTheme } from './core';
import { useEntryDefaults } from './lib/field-shell';
import { type ImageBackend, reactNativeImage, useImageBackend } from './lib/image-backend';
import { useSurfacePresentation } from './lib/surface-presentation';

const styleHost = createStyleTestHost();
const { renderHook, setTheme } = styleHost;

function wrapper(config: KitConfig) {
  return ({ children }: { children: ReactNode }) =>
    createElement(KitProvider, { config, children });
}
function useConfiguredKit() {
  return {
    entry: useEntryDefaults(),
    image: useImageBackend(),
    surfaces: useSurfacePresentation(),
  };
}
afterEach(() => setTheme(KROMA));
describe('root kit configuration', () => {
  it('derives phone entry and surface defaults', () => {
    const { result } = renderHook(useConfiguredKit, { wrapper: wrapper({ formFactor: 'phone' }) });
    expect(result.current.entry).toEqual({ size: 'md', physicalKeyboard: true });
    expect(result.current.surfaces).toBe('dialog');
  });
  it('uses browser density and pointer surfaces', () => {
    const { result } = renderHook(useConfiguredKit, {
      wrapper: wrapper({ formFactor: 'browser' }),
    });
    expect(result.current.entry.size).toBe('sm');
    expect(result.current.surfaces).toBe('panel');
  });
  it('lets explicit defaults override a form factor', () => {
    const { result } = renderHook(useConfiguredKit, {
      wrapper: wrapper({ formFactor: 'browser', entry: { size: 'md' }, surfaces: 'dialog' }),
    });
    expect(result.current.entry).toEqual({ size: 'md', physicalKeyboard: true });
    expect(result.current.surfaces).toBe('dialog');
  });
  it('inherits unspecified capabilities from an outer root', () => {
    const backend: ImageBackend = { fades: true, render: reactNativeImage.render };
    const { result } = renderHook(useConfiguredKit, {
      wrapper: ({ children }) =>
        createElement(
          KitProvider,
          { config: { image: backend } },
          createElement(KitProvider, { config: { formFactor: 'tv' } }, children),
        ),
    });
    expect(result.current.image).toBe(backend);
    expect(result.current.entry.size).toBe('tv');
  });
  it('keeps different mounted roots independent', () => {
    const a = renderHook(useConfiguredKit, { wrapper: wrapper({ formFactor: 'tv' }) });
    const b = renderHook(useConfiguredKit, { wrapper: wrapper({ formFactor: 'browser' }) });
    expect(a.result.current.entry.size).toBe('tv');
    expect(b.result.current.entry.size).toBe('sm');
    a.unmount();
    expect(b.result.current.entry.size).toBe('sm');
    b.unmount();
  });
  it('applies the initial ground before its theme', () => {
    const terminal = createTheme({ typeSpec: { body: { size: 15 } } });
    const config = configureKit({ ground: 'light', theme: terminal });
    const { result } = renderHook(useTheme, { wrapper: wrapper(config) });
    expect(result.current).toBe(terminal);
    expect(Object.isFrozen(config)).toBe(true);
  });
});
