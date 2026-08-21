import { describe, expect, it } from 'vitest';
import { guessPlatform } from './platform.ts';

const UA = {
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  linux:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  android:
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  androidTv:
    'Mozilla/5.0 (Linux; Android 14; BRAVIA 4K GB Build/PTT1.220819.001) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 GoogleTV',
  tizen:
    'Mozilla/5.0 (SMART-TV; LINUX; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/7.0 TV Safari/537.36',
  webos:
    'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.31 Safari/537.36 WebAppManager',
};

describe('guessPlatform', () => {
  it('offers a computer the installer for its own system', () => {
    expect(guessPlatform(UA.mac)).toMatchObject({ family: 'desktop', targets: ['macos'] });
    expect(guessPlatform(UA.windows)).toMatchObject({
      family: 'desktop',
      targets: ['windows-exe', 'windows-msi'],
    });
    expect(guessPlatform(UA.linux)).toMatchObject({
      family: 'desktop',
      targets: ['linux-appimage', 'linux-deb'],
    });
  });

  it('sends a television to its own package rather than to Android', () => {
    expect(guessPlatform(UA.androidTv)).toMatchObject({ family: 'tv', targets: ['androidtv'] });
    expect(guessPlatform(UA.tizen)).toMatchObject({ family: 'tv', targets: ['tizen'] });
    expect(guessPlatform(UA.webos)).toMatchObject({ family: 'tv', targets: ['webos'] });
  });

  it('sends a phone to its family, and an iPhone to no file at all', () => {
    expect(guessPlatform(UA.android)).toMatchObject({ family: 'mobile', targets: ['android'] });
    expect(guessPlatform(UA.iphone)).toMatchObject({ family: 'mobile', targets: [] });
  });

  it('guesses nothing from a user agent that says nothing', () => {
    expect(guessPlatform('')).toBeNull();
    expect(guessPlatform('curl/8.7.1')).toBeNull();
  });
});
