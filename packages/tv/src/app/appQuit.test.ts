import { afterEach, describe, expect, it, vi } from 'vitest';
import { canExitOnBack, canQuitApp, exitOnBack, quitApp } from './appQuit';

afterEach(() => vi.unstubAllGlobals());

describe('canQuitApp', () => {
  it('is offered only by the desktop shell, which has no window chrome', () => {
    expect(canQuitApp()).toBe(false);
    vi.stubGlobal('__TAURI__', {
      core: { invoke: async () => undefined },
      event: { listen: async () => () => {} },
    });
    expect(canQuitApp()).toBe(true);
  });
});

describe('quitApp', () => {
  it('asks the shell to exit through its event loop, which also stops mpv', () => {
    const invoke = vi.fn(async () => undefined);
    vi.stubGlobal('__TAURI__', { core: { invoke }, event: { listen: async () => () => {} } });
    quitApp();
    expect(invoke).toHaveBeenCalledWith('app_quit');
  });

  it('does nothing where there is no shell to ask', () => {
    expect(() => quitApp()).not.toThrow();
  });
});

describe('canExitOnBack', () => {
  it('is offered only where Tizen can close the application', () => {
    expect(canExitOnBack()).toBe(false);

    vi.stubGlobal('tizen', { application: { getCurrentApplication: () => ({ exit: () => {} }) } });

    expect(canExitOnBack()).toBe(true);
  });
});

describe('exitOnBack', () => {
  it('closes the current Tizen application', () => {
    const exit = vi.fn();
    vi.stubGlobal('tizen', { application: { getCurrentApplication: () => ({ exit }) } });

    exitOnBack();

    expect(exit).toHaveBeenCalledOnce();
  });

  it('does nothing off Tizen', () => {
    expect(() => exitOnBack()).not.toThrow();
  });
});
