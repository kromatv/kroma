import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLocalIPv4 } from './local-ip';

describe('getLocalIPv4', () => {
  afterEach(() => {
    vi.useRealTimers();
    for (const key of ['tizen', 'webOS', 'RTCPeerConnection']) {
      delete (globalThis as Record<string, unknown>)[key];
    }
  });

  it('resolves null when no platform network API is available (node)', async () => {
    await expect(getLocalIPv4()).resolves.toBeNull();
  });

  // Tizen's `getPropertyValue(prop, onSuccess, onError)`. Wi-Fi is asked first: a
  // set that is plugged in AND associated answers both.
  function tizenWith(answers: Record<string, { ipAddress?: string } | 'error'>) {
    (globalThis as Record<string, unknown>).tizen = {
      systeminfo: {
        getPropertyValue(
          prop: string,
          onSuccess: (v: { ipAddress?: string }) => void,
          onError: () => void,
        ) {
          const a = answers[prop];
          if (a === undefined || a === 'error') onError();
          else onSuccess(a);
        },
      },
    };
  }

  it('takes the Tizen Wi-Fi address when there is one', async () => {
    tizenWith({ WIFI_NETWORK: { ipAddress: '192.168.1.42' } });
    await expect(getLocalIPv4()).resolves.toBe('192.168.1.42');
  });

  it('falls back to Tizen Ethernet when Wi-Fi is unset', async () => {
    // 0.0.0.0 is what an idle Tizen radio reports, and it is not an address.
    tizenWith({
      WIFI_NETWORK: { ipAddress: '0.0.0.0' },
      ETHERNET_NETWORK: { ipAddress: '10.0.0.7' },
    });
    await expect(getLocalIPv4()).resolves.toBe('10.0.0.7');
  });

  it('resolves null when Tizen Wi-Fi is unset and the Ethernet query then fails', async () => {
    tizenWith({ WIFI_NETWORK: { ipAddress: '0.0.0.0' } });
    await expect(getLocalIPv4()).resolves.toBeNull();
  });

  it('falls back to Tizen Ethernet when the Wi-Fi query itself fails', async () => {
    tizenWith({ WIFI_NETWORK: 'error', ETHERNET_NETWORK: { ipAddress: '10.0.0.8' } });
    await expect(getLocalIPv4()).resolves.toBe('10.0.0.8');
  });

  it('resolves null when neither Tizen interface answers', async () => {
    tizenWith({ WIFI_NETWORK: 'error', ETHERNET_NETWORK: 'error' });
    await expect(getLocalIPv4()).resolves.toBeNull();
  });

  it('keeps the first answer when the Tizen bridge fires its callback twice', async () => {
    (globalThis as Record<string, unknown>).tizen = {
      systeminfo: {
        getPropertyValue(_prop: string, onSuccess: (v: { ipAddress?: string }) => void) {
          onSuccess({ ipAddress: '192.168.1.11' });
          onSuccess({ ipAddress: '192.168.1.22' });
        },
      },
    };
    await expect(getLocalIPv4()).resolves.toBe('192.168.1.11');
  });

  it('gives up on a Tizen bridge that never calls back', async () => {
    vi.useFakeTimers();
    (globalThis as Record<string, unknown>).tizen = { systeminfo: { getPropertyValue() {} } };
    const pending = getLocalIPv4();
    await vi.advanceTimersByTimeAsync(1500);
    await expect(pending).resolves.toBeNull();
  });

  it('survives a Tizen bridge that throws outright', async () => {
    (globalThis as Record<string, unknown>).tizen = {
      systeminfo: {
        getPropertyValue() {
          throw new Error('systeminfo unavailable');
        },
      },
    };
    await expect(getLocalIPv4()).resolves.toBeNull();
  });

  function webOsWith(res: unknown, fail = false) {
    (globalThis as Record<string, unknown>).webOS = {
      service: {
        request(_uri: string, opts: { onSuccess: (r: unknown) => void; onFailure: () => void }) {
          if (fail) opts.onFailure();
          else opts.onSuccess(res);
        },
      },
    };
  }

  it('prefers the webOS wired address over the wireless one', async () => {
    webOsWith({ wired: { ipAddress: '10.1.1.5' }, wifi: { ipAddress: '192.168.0.9' } });
    await expect(getLocalIPv4()).resolves.toBe('10.1.1.5');
  });

  it('uses the webOS wifi address when there is no wired one', async () => {
    webOsWith({ wifi: { ipAddress: '192.168.0.9' } });
    await expect(getLocalIPv4()).resolves.toBe('192.168.0.9');
  });

  it('resolves null when the webOS request fails', async () => {
    webOsWith(null, true);
    await expect(getLocalIPv4()).resolves.toBeNull();
  });

  it('resolves null when webOS reports neither interface', async () => {
    webOsWith({});
    await expect(getLocalIPv4()).resolves.toBeNull();
  });

  it('survives a webOS bridge whose request throws', async () => {
    (globalThis as Record<string, unknown>).webOS = {
      service: {
        request() {
          throw new Error('luna bus unavailable');
        },
      },
    };
    await expect(getLocalIPv4()).resolves.toBeNull();
  });

  it('gives up on a webOS bridge that never calls back', async () => {
    vi.useFakeTimers();
    (globalThis as Record<string, unknown>).webOS = { service: { request() {} } };
    const pending = getLocalIPv4();
    await vi.advanceTimersByTimeAsync(1500);
    await expect(pending).resolves.toBeNull();
  });

  function rtcEmitting(candidates: (string | null)[]) {
    (globalThis as Record<string, unknown>).RTCPeerConnection = class {
      onicecandidate: ((e: { candidate: { candidate: string } | null }) => void) | null = null;
      createDataChannel() {}
      close() {}
      setLocalDescription() {}
      async createOffer() {
        queueMicrotask(() => {
          for (const c of candidates) {
            this.onicecandidate?.({ candidate: c === null ? null : { candidate: c } });
          }
        });
        return {};
      }
    };
  }

  it('reads a private IPv4 out of an ICE candidate', async () => {
    rtcEmitting(['candidate:1 1 udp 2113 192.168.4.21 54321 typ host']);
    await expect(getLocalIPv4()).resolves.toBe('192.168.4.21');
  });

  it('ignores mDNS-obfuscated and public candidates', async () => {
    // `.local` carries no address, and a reflexive address is the router's, not
    // this device's - neither can seed a subnet scan.
    rtcEmitting([
      'candidate:1 1 udp 2113 9f8e.local 54321 typ host',
      'candidate:2 1 udp 1686 203.0.113.7 54321 typ srflx',
      'candidate:3 1 udp 2113 172.16.3.9 54321 typ host',
    ]);
    await expect(getLocalIPv4()).resolves.toBe('172.16.3.9');
  });

  it('keeps the first private candidate and ignores the ones after it', async () => {
    rtcEmitting([
      'candidate:1 1 udp 2113 10.0.0.4 54321 typ host',
      'candidate:2 1 udp 2113 10.0.0.5 54321 typ host',
    ]);
    await expect(getLocalIPv4()).resolves.toBe('10.0.0.4');
  });

  it('ignores an end-of-candidates event and gives up on the timeout', async () => {
    vi.useFakeTimers();
    rtcEmitting([null]);
    const pending = getLocalIPv4();
    await vi.advanceTimersByTimeAsync(1500);
    await expect(pending).resolves.toBeNull();
  });

  it('resolves null when the peer connection cannot be built', async () => {
    (globalThis as Record<string, unknown>).RTCPeerConnection = class {
      constructor() {
        throw new Error('no webrtc');
      }
    };
    await expect(getLocalIPv4()).resolves.toBeNull();
  });
});
