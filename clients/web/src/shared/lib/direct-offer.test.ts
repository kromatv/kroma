// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dismissOffer, offerDismissed, routeHost, shouldOffer } from './direct-offer';

const SERVER = 'https://kroma.example';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('shouldOffer', () => {
  it('offers when only the browser permission is missing', () => {
    expect(shouldOffer({ askable: true }, false)).toBe(true);
  });

  it('offers nothing once a direct route is in use, or the person turned it down', () => {
    expect(shouldOffer({ askable: true, route: 'http://192.168.1.2:4040' }, false)).toBe(false);
    expect(shouldOffer({ askable: true }, true)).toBe(false);
  });

  it('offers nothing where the server did not place the browser on its network', () => {
    expect(shouldOffer({ askable: false }, false)).toBe(false);
  });
});

describe('a dismissal', () => {
  it('is remembered per server', () => {
    dismissOffer(SERVER);

    expect(offerDismissed(SERVER)).toBe(true);
    expect(offerDismissed('https://other.example')).toBe(false);
  });

  it('reads as never made when storage cannot be reached', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });

    dismissOffer(SERVER);

    expect(offerDismissed(SERVER)).toBe(false);
  });
});

describe('routeHost', () => {
  it('names the address a route goes to', () => {
    expect(routeHost('http://192.168.1.2:4040')).toBe('192.168.1.2');
  });
});
