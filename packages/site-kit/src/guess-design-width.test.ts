import { describe, expect, it } from 'vitest';
import { DESKTOP_WIDTH, guessDesignWidth } from './guess-design-width';

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_TABLET =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

describe('guessDesignWidth', () => {
  it('lays a desktop browser out at the desktop width', () => {
    expect(guessDesignWidth({ agent: CHROME_MAC })).toBe(DESKTOP_WIDTH);
    expect(guessDesignWidth({ agent: FIREFOX_LINUX })).toBe(DESKTOP_WIDTH);
  });

  it('trusts a client hint that says the browser is not mobile', () => {
    expect(guessDesignWidth({ mobile: '?0' })).toBe(DESKTOP_WIDTH);
  });

  it('leaves a phone on the phone layout', () => {
    expect(guessDesignWidth({ agent: IPHONE })).toBeUndefined();
    expect(guessDesignWidth({ mobile: '?1', agent: CHROME_MAC })).toBeUndefined();
  });

  it('leaves an Android tablet on the phone layout even when it says it is not mobile', () => {
    expect(guessDesignWidth({ mobile: '?0', agent: ANDROID_TABLET })).toBeUndefined();
  });

  it('pins nothing for a request that names no device', () => {
    expect(guessDesignWidth({})).toBeUndefined();
    expect(guessDesignWidth({ agent: 'node' })).toBeUndefined();
  });
});
