import { beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ OS: 'ios' as string }));
vi.mock('react-native', () => ({ Platform: platform }));

const notifications = vi.hoisted(() => ({
  getPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  getDevicePushTokenAsync: vi.fn(async () => ({ type: 'ios', data: 'DEVICE-TOKEN' })),
  setNotificationCategoryAsync: vi.fn(
    async (
      _name: string,
      _actions: Array<{
        identifier: string;
        buttonTitle: string;
        options: { opensAppToForeground: boolean };
      }>,
    ) => undefined,
  ),
  setNotificationChannelAsync: vi.fn(async (_id: string, _channel: unknown) => undefined),
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
}));
const loadPush = vi.hoisted(() => vi.fn(() => notifications as unknown));
vi.mock('./native', () => ({ push: loadPush }));

const relay = vi.hoisted(() => ({
  grantFor: vi.fn(async () => 'v1.sealed'),
  storedGrant: vi.fn(async () => 'v1.sealed' as string | null),
  forgetGrant: vi.fn(async () => undefined),
}));
vi.mock('./relay', () => relay);

vi.mock('#mobile/lib/device', () => ({ deviceLabel: () => 'iPhone 17 Pro' }));

const hardware = vi.hoisted(() => ({ isDevice: true }));
vi.mock('expo-device', () => ({
  get isDevice() {
    return hardware.isDevice;
  },
}));

const { nativePush, registerAndroidChannels, registerCategories, setPushTranslator } = await import(
  './push'
);

beforeEach(() => {
  platform.OS = 'ios';
  hardware.isDevice = true;
  loadPush.mockReturnValue(notifications as unknown);
  notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
  notifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });
  notifications.getDevicePushTokenAsync.mockResolvedValue({ type: 'ios', data: 'DEVICE-TOKEN' });
  notifications.setNotificationCategoryAsync.mockClear();
  notifications.setNotificationChannelAsync.mockClear();
  relay.grantFor.mockClear().mockResolvedValue('v1.sealed');
  relay.storedGrant.mockClear().mockResolvedValue('v1.sealed');
  relay.forgetGrant.mockClear();
});

describe('why push might be unavailable', () => {
  it('is available on a phone that has not been asked yet', async () => {
    notifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    expect(await nativePush.blocker()).toBeNull();
  });

  it('reports a build whose native module is missing', async () => {
    loadPush.mockReturnValue(null);
    expect(await nativePush.blocker()).toBe('needs-rebuild');
  });

  it('reports a platform that has no push at all', async () => {
    platform.OS = 'web';
    expect(await nativePush.blocker()).toBe('unsupported');
  });

  it('reports a permission the app can no longer ask about', async () => {
    // Terminal from inside the app: iOS prompts once, so the reader has to
    // change it in Settings - which is what the copy for this blocker says.
    notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied' });
    expect(await nativePush.blocker()).toBe('denied');
  });

  it('does NOT refuse a simulator up front', async () => {
    // A simulator shows the dialog perfectly well and on iOS 16+ registers for
    // real. Only minting may fail, which `subscribe` reports once it has tried;
    // refusing here would hide the prompt from the devices most testing uses.
    expect(await nativePush.blocker()).toBeNull();
  });
});

describe('turning push on', () => {
  it('registers the grant and never the device token', async () => {
    const body = await nativePush.subscribe({ applicationServerKey: 'ignored-by-native' });

    expect(relay.grantFor).toHaveBeenCalledWith('apns', 'DEVICE-TOKEN');
    expect(body).toEqual({
      transport: 'relay',
      endpoint: 'v1.sealed',
      device: 'iPhone 17 Pro',
    });
    expect(JSON.stringify(body)).not.toContain('DEVICE-TOKEN');
  });

  it('seals an Android token as fcm', async () => {
    platform.OS = 'android';
    notifications.getDevicePushTokenAsync.mockResolvedValue({ type: 'android', data: 'FCM-TOKEN' });
    await nativePush.subscribe({ applicationServerKey: '' });
    expect(relay.grantFor).toHaveBeenCalledWith('fcm', 'FCM-TOKEN');
  });

  it('refuses when the reader dismisses the prompt, before minting anything', async () => {
    notifications.requestPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    await expect(nativePush.subscribe({ applicationServerKey: '' })).rejects.toThrow('denied');
    expect(relay.grantFor).not.toHaveBeenCalled();
  });

  it('reports a real device that cannot mint a token as unsupported', async () => {
    // `expo-device` says this is real hardware, so "use a real phone" would be
    // the wrong thing to tell the reader - the blocker names the device, not the
    // simulator. Both paths fail to mint; only the message differs.
    notifications.getDevicePushTokenAsync.mockRejectedValue(new Error('no APNs'));
    await expect(nativePush.subscribe({ applicationServerKey: '' })).rejects.toThrow('unsupported');
    expect(relay.grantFor).not.toHaveBeenCalled();
  });

  it('refuses a token from a service it cannot name', async () => {
    notifications.getDevicePushTokenAsync.mockResolvedValue({ type: 'carrier-pigeon', data: 'x' });
    await expect(nativePush.subscribe({ applicationServerKey: '' })).rejects.toThrow('unsupported');
    expect(relay.grantFor).not.toHaveBeenCalled();
  });

  it('refuses outright when the native module is missing', async () => {
    loadPush.mockReturnValue(null);
    await expect(nativePush.subscribe({ applicationServerKey: '' })).rejects.toThrow(
      'needs-rebuild',
    );
  });

  it('tells a simulator apart from a phone that simply cannot register', async () => {
    hardware.isDevice = false;
    notifications.getDevicePushTokenAsync.mockRejectedValue(new Error('no APNs'));
    await expect(nativePush.subscribe({ applicationServerKey: '' })).rejects.toThrow('simulator');
  });
});

describe('the labels handed to the OS', () => {
  it('registers the action buttons in the reader s language', async () => {
    setPushTranslator(((key: string) => `fr:${key}`) as never);
    await registerCategories();

    const [name, actions] = notifications.setNotificationCategoryAsync.mock.calls[0] ?? [];
    expect(name).toBe('request_review');
    expect(actions?.[0]).toEqual({
      identifier: 'approve',
      buttonTitle: 'fr:notifications.action.approve',
      options: { opensAppToForeground: false },
    });
  });

  it('opens the app for "watch" and leaves the lock screen alone for a review', async () => {
    await registerCategories();
    const opens = new Map(
      notifications.setNotificationCategoryAsync.mock.calls.map(([name, actions]) => [
        name,
        actions[0]?.options,
      ]),
    );
    expect(opens.get('media_available')).toEqual({ opensAppToForeground: true });
    expect(opens.get('request_review')).toEqual({ opensAppToForeground: false });
  });

  it('registers no category on a build with no native push module', async () => {
    loadPush.mockReturnValue(null);
    await registerCategories();
    expect(notifications.setNotificationCategoryAsync).not.toHaveBeenCalled();
  });

  it('gives every Android channel its own importance', async () => {
    platform.OS = 'android';
    await registerAndroidChannels();
    const ids = notifications.setNotificationChannelAsync.mock.calls.map(([id]) => id);
    expect(ids).toEqual(['default', 'request_review', 'media_available']);
  });

  it('registers no channel on iOS, which has none', async () => {
    await registerAndroidChannels();
    expect(notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  });

  it('registers no channel on a build with no native push module', async () => {
    platform.OS = 'android';
    loadPush.mockReturnValue(null);
    await registerAndroidChannels();
    expect(notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  });
});

describe('turning push off', () => {
  it('names the grant the server actually stored', async () => {
    // Minting a fresh one here would return a different blob, the server would
    // delete nothing, and a phone the reader believes is silent keeps buzzing.
    expect(await nativePush.endpoint()).toBe('v1.sealed');
    expect(relay.grantFor).not.toHaveBeenCalled();
  });

  it('forgets the grant so the next enable mints a fresh one', async () => {
    await nativePush.unsubscribe();
    expect(relay.forgetGrant).toHaveBeenCalled();
  });

  it('has no endpoint to name when this device never registered', async () => {
    relay.storedGrant.mockResolvedValue(null);
    expect(await nativePush.endpoint()).toBeNull();
  });
});
