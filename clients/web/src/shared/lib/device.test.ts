import { describe, expect, it } from 'vitest';
import { deviceInfo } from './device';

// What this protects: a row in the account's session list. Every miss here reads
// as "Unknown device" next to a working sign-in, which is how the phone app went
// unnamed for as long as it did.
describe('deviceInfo', () => {
  it('names a browser by browser and platform', () => {
    const chrome =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';
    expect(deviceInfo(chrome, '?')).toEqual({ label: 'Chrome · macOS', kind: 'desktop' });
  });

  it('names a mobile browser', () => {
    const safari =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
    expect(deviceInfo(safari, '?')).toEqual({ label: 'Safari · iOS', kind: 'mobile' });
  });

  it('names a native app by its device model, not its app name', () => {
    expect(deviceInfo('Kroma/0.1.3 (iPhone 17 Pro; iOS 26.0)', '?')).toEqual({
      label: 'iPhone 17 Pro · iOS',
      kind: 'mobile',
    });
    expect(deviceInfo('Kroma/0.1.3 (Pixel 8; Android 15)', '?')).toEqual({
      label: 'Pixel 8 · Android',
      kind: 'mobile',
    });
    expect(deviceInfo('Kroma/0.1.3 (Apple TV 4K; tvOS 26.0)', '?')).toEqual({
      label: 'Apple TV 4K · tvOS',
      kind: 'tv',
    });
  });

  it('names the television platforms ahead of the systems they run on', () => {
    const tizen =
      'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/6.0 TV Safari/537.36';
    // Tizen 6's browser reports no Chrome token, only Safari's.
    expect(deviceInfo(tizen, '?')).toEqual({ label: 'Safari · Tizen', kind: 'tv' });
    const webos =
      'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager';
    expect(deviceInfo(webos, '?')).toEqual({ label: 'Chrome · webOS', kind: 'tv' });
    expect(deviceInfo('Kroma/0.1.35 (BRAVIA 4K; Android TV 14)', '?')).toEqual({
      label: 'BRAVIA 4K · Android TV',
      kind: 'tv',
    });
  });

  it('still names the app when a native build sends the platform default', () => {
    // What iOS sends when nobody sets a User-Agent - no browser, no OS token.
    expect(deviceInfo('KROMA/1 CFNetwork/3860.600.12 Darwin/27.0.0', '?').label).toBe('Kroma');
  });

  it('falls back for a missing or unreadable User-Agent', () => {
    expect(deviceInfo(null, 'Unknown device')).toEqual({
      label: 'Unknown device',
      kind: 'desktop',
    });
    expect(deviceInfo('   ', 'Unknown device').label).toBe('Unknown device');
    expect(deviceInfo('okhttp/4.12.0', 'Unknown device').label).toBe('Unknown device');
  });
});
