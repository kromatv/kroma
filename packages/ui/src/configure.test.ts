// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { configureKit } from './configure';
import { activeTheme, createTheme, KROMA, setTheme } from './core';
import { entryDefaultPhysicalKeyboard, entryDefaultSize } from './lib/field-shell';
import { type ImageBackend, imageBackend, reactNativeImage } from './lib/image-backend';
import { useSurfacePresentation } from './lib/surface-presentation';

const shellPresentation = () => renderHook(() => useSurfacePresentation()).result.current;

afterEach(() => {
  configureKit({ formFactor: 'tv', image: reactNativeImage });
  setTheme(KROMA);
});

describe('configureKit', () => {
  it('states a form factor once instead of restating each consequence', () => {
    configureKit({ formFactor: 'phone' });

    expect(entryDefaultSize()).toBe('md');
    expect(entryDefaultPhysicalKeyboard()).toBe(true);
    expect(shellPresentation()).toBe('dialog');
  });

  it('leaves a browser page its surfaces, which the pointer answers for', () => {
    configureKit({ formFactor: 'browser' });

    expect(entryDefaultSize()).toBe('sm');
    expect(shellPresentation()).toBe('panel');
  });

  it('lets a shell override one half of the form factor it named', () => {
    configureKit({ formFactor: 'browser', entry: { size: 'md' }, surfaces: 'dialog' });

    expect(entryDefaultSize()).toBe('md');
    expect(entryDefaultPhysicalKeyboard()).toBe(true);
    expect(shellPresentation()).toBe('dialog');
  });

  it('leaves every default it was told nothing about standing', () => {
    const backend: ImageBackend = { fades: true, render: reactNativeImage.render };

    configureKit({ formFactor: 'phone' });
    configureKit({ image: backend });

    expect(entryDefaultSize()).toBe('md');
    expect(imageBackend()).toBe(backend);
  });

  it('applies the ground before the theme, so the theme is what stands', () => {
    const terminal = createTheme({ typeSpec: { body: { size: 15 } } });

    configureKit({ ground: 'light', theme: terminal });

    expect(activeTheme()).toBe(terminal);
  });
});
