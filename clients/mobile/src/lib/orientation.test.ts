import { beforeEach, describe, expect, it, vi } from 'vitest';

const device = vi.hoisted(() => ({ os: 'ios' as 'ios' | 'android', tablet: false }));
const lockAsync = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return device.os;
    },
  },
}));
vi.mock('expo-screen-orientation', () => ({
  OrientationLock: { PORTRAIT_UP: 'portrait-up' },
  lockAsync,
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
    device.os = 'ios';
    device.tablet = false;
  });

  it('locks an iPhone upright through the module that owns the root controller', async () => {
    const { lockUpright, UPRIGHT, PLAYER_ORIENTATION } = await load();
    lockUpright();
    expect(lockAsync).toHaveBeenCalledWith('portrait-up');
    expect(UPRIGHT).toBeUndefined();
    expect(PLAYER_ORIENTATION).toBe('landscape');
  });

  it('leaves an iPad free and locks nothing', async () => {
    device.tablet = true;
    const { lockUpright, UPRIGHT, PLAYER_ORIENTATION } = await load();
    lockUpright();
    expect(lockAsync).not.toHaveBeenCalled();
    expect(UPRIGHT).toBeUndefined();
    expect(PLAYER_ORIENTATION).toBe('default');
  });

  it('tells the stack on an Android phone, where the screens apply it themselves', async () => {
    device.os = 'android';
    const { lockUpright, UPRIGHT, PLAYER_ORIENTATION } = await load();
    lockUpright();
    expect(lockAsync).not.toHaveBeenCalled();
    expect(UPRIGHT).toBe('portrait');
    expect(PLAYER_ORIENTATION).toBe('landscape');
  });

  it('lets an Android tablet rotate everywhere', async () => {
    device.os = 'android';
    device.tablet = true;
    const { UPRIGHT } = await load();
    expect(UPRIGHT).toBe('default');
  });

  it('swallows a refused lock', async () => {
    lockAsync.mockImplementationOnce(() => Promise.reject(new Error('unsupported')));
    const { lockUpright } = await load();
    expect(() => lockUpright()).not.toThrow();
    await Promise.resolve();
  });
});
