import { beforeEach, describe, expect, it, vi } from 'vitest';

const device = vi.hoisted(() => ({ os: 'ios' as 'ios' | 'android', tablet: false }));
const lockAsync = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const unlockAsync = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return device.os;
    },
  },
}));
vi.mock('expo-screen-orientation', () => ({
  OrientationLock: { PORTRAIT_UP: 'portrait-up', LANDSCAPE: 'landscape' },
  lockAsync,
  unlockAsync,
}));
vi.mock('#mobile/lib/layout', () => ({
  get isTablet() {
    return device.tablet;
  },
}));

async function load() {
  vi.resetModules();
  return import('./orientation');
}

describe('orientation', () => {
  beforeEach(() => {
    lockAsync.mockClear();
    unlockAsync.mockClear();
    device.os = 'ios';
    device.tablet = false;
  });

  it('locks an iPhone upright through the module that owns the root controller', async () => {
    const { lockUpright, UPRIGHT, PLAYER_ORIENTATION } = await load();
    lockUpright();
    expect(lockAsync).toHaveBeenCalledWith('portrait-up');
    expect(UPRIGHT).toBe('portrait');
    expect(PLAYER_ORIENTATION).toBe('portrait');
  });

  it('leaves an iPad free and locks nothing', async () => {
    device.tablet = true;
    const { lockUpright, UPRIGHT, PLAYER_ORIENTATION } = await load();
    lockUpright();
    expect(lockAsync).not.toHaveBeenCalled();
    expect(UPRIGHT).toBe('default');
    expect(PLAYER_ORIENTATION).toBe('default');
  });

  it('tells the stack on an Android phone, where the screens apply it themselves', async () => {
    device.os = 'android';
    const { lockUpright, UPRIGHT, PLAYER_ORIENTATION } = await load();
    lockUpright();
    expect(lockAsync).not.toHaveBeenCalled();
    expect(UPRIGHT).toBe('portrait');
    expect(PLAYER_ORIENTATION).toBe('portrait');
  });

  it('lets an Android tablet rotate everywhere', async () => {
    device.os = 'android';
    device.tablet = true;
    const { UPRIGHT } = await load();
    expect(UPRIGHT).toBe('default');
  });

  it('requests landscape and portrait for the explicit presentation buttons', async () => {
    const { lockPlayerOrientation } = await load();
    await lockPlayerOrientation(true);
    expect(lockAsync).toHaveBeenLastCalledWith('landscape');
    await lockPlayerOrientation(false);
    expect(lockAsync).toHaveBeenLastCalledWith('portrait-up');
  });

  it('requests button rotation on Android without locking the surrounding app globally', async () => {
    device.os = 'android';
    const { lockPlayerOrientation } = await load();
    await lockPlayerOrientation(true);
    expect(lockAsync).toHaveBeenLastCalledWith('landscape');
  });

  it('keeps tablet fullscreen in its current orientation', async () => {
    device.tablet = true;
    const { lockPlayerOrientation } = await load();
    await lockPlayerOrientation(true);
    expect(lockAsync).not.toHaveBeenCalled();
  });

  it('gives phone screens the current mode mask and leaves tablets unrestricted', async () => {
    const phone = await load();
    expect(phone.playerOrientation(false)).toBe('portrait');
    expect(phone.playerOrientation(true)).toBe('landscape');
    device.tablet = true;
    const tablet = await load();
    expect(tablet.playerOrientation(false)).toBe('default');
    expect(tablet.playerOrientation(true)).toBe('default');
  });

  it('releases the temporary lock so physical device turns can rotate the player', async () => {
    const { allowPlayerRotation } = await load();
    await allowPlayerRotation();
    expect(unlockAsync).toHaveBeenCalledOnce();
  });

  it('swallows a refused lock', async () => {
    lockAsync.mockImplementationOnce(() => Promise.reject(new Error('unsupported')));
    const { lockUpright } = await load();
    expect(() => lockUpright()).not.toThrow();
    await Promise.resolve();
  });

  it('swallows a refused automatic rotation policy', async () => {
    unlockAsync.mockRejectedValueOnce(new Error('unsupported'));
    const { allowPlayerRotation } = await load();
    await expect(allowPlayerRotation()).resolves.toBeUndefined();
  });
});
