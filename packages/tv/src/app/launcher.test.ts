import { afterEach, describe, expect, it, vi } from 'vitest';
import { type LauncherBackend, launcherBackend, setLauncherBackend } from './launcher';

function fake(): LauncherBackend {
  return { setContinueWatching: vi.fn(), setHomeChannel: vi.fn() };
}

afterEach(() => setLauncherBackend(null));

describe('launcherBackend', () => {
  it('is absent on a shell that registered none', () => {
    expect(launcherBackend()).toBeNull();
  });

  it('is whatever the shell registered at its app root', () => {
    const backend = fake();
    setLauncherBackend(backend);
    expect(launcherBackend()).toBe(backend);
  });

  it('takes the last registration, so a remount replaces rather than stacks', () => {
    const first = fake();
    const second = fake();
    setLauncherBackend(first);
    setLauncherBackend(second);
    expect(launcherBackend()).toBe(second);
  });

  it('goes back to the silent default when the shell hands back null', () => {
    setLauncherBackend(fake());
    setLauncherBackend(null);
    expect(launcherBackend()).toBeNull();
  });

  it('publishes both rows through the registered backend', () => {
    const backend = fake();
    setLauncherBackend(backend);
    launcherBackend()?.setContinueWatching('[]');
    launcherBackend()?.setHomeChannel('[]');
    expect(backend.setContinueWatching).toHaveBeenCalledWith('[]');
    expect(backend.setHomeChannel).toHaveBeenCalledWith('[]');
  });
});
