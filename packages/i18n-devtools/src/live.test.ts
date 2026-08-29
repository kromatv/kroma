import { afterEach, describe, expect, it, vi } from 'vitest';
import { liveState, onLiveChange, setLive } from './live';

afterEach(() => {
  setLive({ keys: false, outline: 'off', locale: null });
});

describe('the switches the tools are set to', () => {
  it('starts with every one of them off', () => {
    expect(liveState()).toEqual({ keys: false, outline: 'off', locale: null });
  });

  it('moves the one it is given and leaves the rest', () => {
    setLive({ outline: 'all' });

    expect(liveState()).toEqual({ keys: false, outline: 'all', locale: null });
  });

  it('answers the same object until a switch actually moves', () => {
    const before = liveState();

    setLive({ keys: false });

    expect(liveState()).toBe(before);
  });

  it('tells everyone watching when one moves', () => {
    const heard = vi.fn();
    const stop = onLiveChange(heard);

    setLive({ keys: true });
    stop();

    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('says nothing for a set that changes none of them', () => {
    setLive({ locale: 'fr' });
    const heard = vi.fn();
    const stop = onLiveChange(heard);

    setLive({ locale: 'fr' });
    stop();

    expect(heard).not.toHaveBeenCalled();
  });

  it('stops telling one that has stopped watching', () => {
    const heard = vi.fn();
    onLiveChange(heard)();

    setLive({ keys: true });

    expect(heard).not.toHaveBeenCalled();
  });

  it('is one record for the page, whatever copy of this module asks', async () => {
    setLive({ outline: 'problems' });
    vi.resetModules();

    const again = await import('./live');

    expect(again.liveState().outline).toBe('problems');
  });
});

describe('the engine a test inspects', () => {
  it('answers for every method the panel calls on it', async () => {
    const { testEngine } = await import('./testing');
    const engine = testEngine();

    engine.inspect(null);
    engine.overrideLocale('fr');

    expect([engine.name, engine.activeLocale(), engine.locales()]).toEqual([
      'test',
      'fr',
      ['fr', 'en'],
    ]);
  });
});
