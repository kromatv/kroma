import { afterEach, describe, expect, it, vi } from 'vitest';
import { canExitOnBack, canQuitApp, exitNeedsConfirm, exitOnBack, quitApp } from './appQuit';

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
  it('is offered where Tizen can close the application', () => {
    expect(canExitOnBack()).toBe(false);

    vi.stubGlobal('tizen', { application: { getCurrentApplication: () => ({ exit: () => {} }) } });

    expect(canExitOnBack()).toBe(true);
  });

  it("is offered where webOS's platform Back can leave the app", () => {
    vi.stubGlobal('PalmSystem', {});
    expect(canExitOnBack()).toBe(false);

    vi.stubGlobal('PalmSystem', { platformBack: () => {} });

    expect(canExitOnBack()).toBe(true);
  });
});

describe('exitNeedsConfirm', () => {
  it('asks on Tizen, where Samsung puts the prompt on the application', () => {
    expect(exitNeedsConfirm()).toBe(false);

    vi.stubGlobal('tizen', { application: { getCurrentApplication: () => ({ exit: () => {} }) } });

    expect(exitNeedsConfirm()).toBe(true);
  });

  it('stays quiet on webOS, which raises a prompt of its own', () => {
    vi.stubGlobal('PalmSystem', { platformBack: () => {} });

    expect(exitNeedsConfirm()).toBe(false);
  });
});

describe('exitOnBack', () => {
  it('closes the current Tizen application', () => {
    const exit = vi.fn();
    vi.stubGlobal('tizen', { application: { getCurrentApplication: () => ({ exit }) } });

    exitOnBack();

    expect(exit).toHaveBeenCalledOnce();
  });

  it('hands webOS its platform Back', () => {
    const platformBack = vi.fn();
    vi.stubGlobal('PalmSystem', { platformBack });

    exitOnBack();

    expect(platformBack).toHaveBeenCalledOnce();
  });

  it('does nothing where no shell offers an exit', () => {
    expect(() => exitOnBack()).not.toThrow();
  });
});
