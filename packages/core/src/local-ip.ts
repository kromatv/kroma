// Best-effort local IPv4 through whatever the platform offers: the Tizen and
// webOS network bridges, then WebRTC.

/** Best-effort local IPv4: Tizen/webOS network APIs, then a WebRTC fallback. */
export async function getLocalIPv4(): Promise<string | null> {
  return (await tizenLocalIp()) ?? (await webosLocalIp()) ?? (await webrtcLocalIp());
}

function once<T>(resolve: (value: T) => void): (value: T) => void {
  let settled = false;
  return (value: T) => {
    if (!settled) {
      settled = true;
      resolve(value);
    }
  };
}

function tizenLocalIp(): Promise<string | null> {
  const tizen = (globalThis as { tizen?: TizenSystemInfo }).tizen;
  const si = tizen?.systeminfo;
  if (!si?.getPropertyValue) return Promise.resolve(null);
  return new Promise((resolve) => {
    const finish = once(resolve);
    const good = (ip?: string) => (ip && ip !== '0.0.0.0' ? ip : null);
    try {
      si.getPropertyValue(
        'WIFI_NETWORK',
        (w) => {
          const ip = good(w?.ipAddress);
          if (ip) return finish(ip);
          si.getPropertyValue(
            'ETHERNET_NETWORK',
            (e) => finish(good(e?.ipAddress)),
            () => finish(null),
          );
        },
        () =>
          si.getPropertyValue(
            'ETHERNET_NETWORK',
            (e) => finish(good(e?.ipAddress)),
            () => finish(null),
          ),
      );
    } catch {
      finish(null);
    }
    setTimeout(() => finish(null), 1500);
  });
}

function webosLocalIp(): Promise<string | null> {
  const svc = (globalThis as { webOS?: WebOSBridge }).webOS?.service;
  if (!svc?.request) return Promise.resolve(null);
  return new Promise((resolve) => {
    const finish = once(resolve);
    try {
      svc.request('luna://com.palm.connectionmanager', {
        method: 'getStatus',
        parameters: {},
        onSuccess: (res) => finish(res?.wired?.ipAddress ?? res?.wifi?.ipAddress ?? null),
        onFailure: () => finish(null),
      });
    } catch {
      finish(null);
    }
    setTimeout(() => finish(null), 1500);
  });
}

function webrtcLocalIp(): Promise<string | null> {
  const RTC = (globalThis as { RTCPeerConnection?: typeof RTCPeerConnection }).RTCPeerConnection;
  if (!RTC) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: string | null) => {
      if (!settled) {
        settled = true;
        try {
          pc.close();
        } catch {
          /* ignore */
        }
        resolve(v);
      }
    };
    let pc: RTCPeerConnection;
    try {
      pc = new RTC({ iceServers: [] });
      pc.createDataChannel('kroma');
      pc.onicecandidate = (e) => {
        const cand = e.candidate?.candidate;
        if (!cand) return;
        // Ignore mDNS-obfuscated candidates (`*.local`); take a private IPv4.
        const ip = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/.exec(cand)?.[1];
        if (ip && isPrivateIPv4(ip)) finish(ip);
      };
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => finish(null));
    } catch {
      return finish(null);
    }
    setTimeout(() => finish(null), 1500);
  });
}

function isPrivateIPv4(ip: string): boolean {
  return ip.startsWith('10.') || ip.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}

interface TizenNetwork {
  ipAddress?: string;
}
interface TizenSystemInfo {
  systeminfo?: {
    getPropertyValue(
      prop: 'WIFI_NETWORK' | 'ETHERNET_NETWORK',
      onSuccess: (data: TizenNetwork) => void,
      onError?: () => void,
    ): void;
  };
}
interface WebOSBridge {
  service?: {
    request(
      uri: string,
      params: {
        method: string;
        parameters?: unknown;
        onSuccess?: (res: { wired?: TizenNetwork; wifi?: TizenNetwork }) => void;
        onFailure?: () => void;
      },
    ): void;
  };
}
