import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatchRemoteKey, registerTvMediaKeys, resolveRemoteKey } from './remote';

function ev(p: { key?: string; keyCode?: number; repeat?: boolean }): KeyboardEvent {
  return {
    key: p.key ?? '',
    keyCode: p.keyCode ?? 0,
    repeat: p.repeat ?? false,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent;
}

describe('resolveRemoteKey', () => {
  it('resolves named keys', () => {
    expect(resolveRemoteKey(ev({ key: 'ArrowUp' }))).toBe('Up');
    expect(resolveRemoteKey(ev({ key: 'ArrowLeft' }))).toBe('Left');
    expect(resolveRemoteKey(ev({ key: 'Enter' }))).toBe('Enter');
    expect(resolveRemoteKey(ev({ key: 'Escape' }))).toBe('Back');
    expect(resolveRemoteKey(ev({ key: 'MediaPlayPause' }))).toBe('PlayPause');
  });

  it('maps both spacebar spellings to PlayPause', () => {
    expect(resolveRemoteKey(ev({ key: ' ' }))).toBe('PlayPause');
    expect(resolveRemoteKey(ev({ key: 'Spacebar' }))).toBe('PlayPause');
  });

  it('falls back to the legacy numeric keyCode when the name is unmapped', () => {
    expect(resolveRemoteKey(ev({ key: '', keyCode: 10009 }))).toBe('Back'); // Tizen back
    expect(resolveRemoteKey(ev({ key: '', keyCode: 461 }))).toBe('Back'); // webOS back
    expect(resolveRemoteKey(ev({ key: '', keyCode: 415 }))).toBe('Play');
    expect(resolveRemoteKey(ev({ key: '', keyCode: 403 }))).toBe('ColorRed');
  });

  it('prefers the named key over the numeric code', () => {
    expect(resolveRemoteKey(ev({ key: 'ArrowUp', keyCode: 10009 }))).toBe('Up');
  });

  it('returns null when nothing maps', () => {
    expect(resolveRemoteKey(ev({ key: 'a' }))).toBeNull();
    expect(resolveRemoteKey(ev({ key: '', keyCode: 999 }))).toBeNull();
  });
});

describe('dispatchRemoteKey', () => {
  it('invokes the handler and preventDefaults a handled key', () => {
    const enter = vi.fn(() => undefined);
    const e = ev({ key: 'Enter' });
    expect(dispatchRemoteKey(e, { Enter: enter })).toBe('Enter');
    expect(enter).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('leaves the default (no preventDefault) when the handler returns false', () => {
    const left = vi.fn(() => false);
    const e = ev({ key: 'ArrowLeft' });
    expect(dispatchRemoteKey(e, { Left: left })).toBe('Left');
    expect(left).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('returns null and does nothing for an unresolved key', () => {
    const e = ev({ key: 'a' });
    expect(dispatchRemoteKey(e, { Enter: vi.fn() })).toBeNull();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('resolves an unbound key but calls no handler', () => {
    const e = ev({ key: 'ArrowRight' });
    expect(dispatchRemoteKey(e, { Enter: vi.fn() })).toBe('Right');
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('swallows auto-repeat for keys in ignoreRepeat without firing the handler', () => {
    const enter = vi.fn();
    const e = ev({ key: 'Enter', repeat: true });
    expect(dispatchRemoteKey(e, { Enter: enter }, { ignoreRepeat: ['Enter'] })).toBe('Enter');
    expect(enter).not.toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('still fires a repeat for a key not listed in ignoreRepeat', () => {
    const down = vi.fn();
    const e = ev({ key: 'ArrowDown', repeat: true });
    expect(dispatchRemoteKey(e, { Down: down }, { ignoreRepeat: ['Enter'] })).toBe('Down');
    expect(down).toHaveBeenCalledTimes(1);
  });
});

describe('registerTvMediaKeys', () => {
  afterEach(() => {
    delete (globalThis as { tizen?: unknown }).tizen;
  });

  it('is a no-op without the Tizen input-device API', () => {
    expect(() => registerTvMediaKeys()).not.toThrow();
  });

  it('registers every media/colour key when Tizen is present', () => {
    const registerKey = vi.fn();
    (globalThis as { tizen?: unknown }).tizen = { tvinputdevice: { registerKey } };
    registerTvMediaKeys();
    expect(registerKey).toHaveBeenCalledWith('MediaPlay');
    expect(registerKey).toHaveBeenCalledWith('ColorF0Red');
    expect(registerKey).toHaveBeenCalledTimes(10);
  });

  it('swallows a per-key registration error', () => {
    const registerKey = vi.fn(() => {
      throw new Error('unsupported on this model');
    });
    (globalThis as { tizen?: unknown }).tizen = { tvinputdevice: { registerKey } };
    expect(() => registerTvMediaKeys()).not.toThrow();
    expect(registerKey).toHaveBeenCalledTimes(10);
  });
});
