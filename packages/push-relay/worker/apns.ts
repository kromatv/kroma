// Apple, from inside the relay. Mirrors `server/crates/kroma-push/src/apns.rs` — the same
// payload, the same headers, the same two facts that are easy to get wrong: APNs refuses
// HTTP/1.1 (a Worker's `fetch` speaks HTTP/2 to Apple, so this is handled for us), and a device
// token belongs to exactly ONE of the two hosts. That second one is why nothing here takes an
// "environment" argument. A relay serves every KROMA server at once, so it sees TestFlight
// tokens and Xcode tokens in the same second and no global choice could be right for both. It
// tries production and falls back on the one rejection that means "wrong host".

import { importEs256, sign } from './jwt';
import type { Notification } from './notification';
import { apnsPayload } from './notification';
import type { Delivery } from './schemas';

const HOSTS = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
} as const;

// Apple caps token generation at one per 20 minutes per key and rejects a
// token older than an hour, so 45 minutes sits comfortably inside both.
// Cached per isolate: this is a derived credential, not request state, and
// re-signing per push would be pointless work against a documented rate limit.
const TOKEN_LIFETIME_SECS = 45 * 60;
let cached: { token: string; mintedAt: number; keyId: string } | null = null;

export interface AppleConfig {
  p8: string;
  keyId: string;
  teamId: string;
  topic: string;
}

async function bearer(config: AppleConfig, nowSecs: number): Promise<string> {
  if (cached?.keyId === config.keyId && nowSecs - cached.mintedAt < TOKEN_LIFETIME_SECS) {
    return cached.token;
  }
  const key = await importEs256(config.p8);
  const token = await sign(
    key,
    { alg: 'ES256', kid: config.keyId },
    { iss: config.teamId, iat: nowSecs },
  );
  cached = { token, mintedAt: nowSecs, keyId: config.keyId };
  return token;
}

function reasonOf(body: string): string {
  try {
    const { reason } = JSON.parse(body) as { reason?: unknown };
    // Apple's `reason` is a string; anything else is not a reason we can act on,
    // and stringifying it would put "[object Object]" in a log and in the
    // `is_gone` comparison.
    return typeof reason === 'string' ? reason : '';
  } catch {
    return '';
  }
}

/** Deliver one notification to one device token. */
export async function send(
  config: AppleConfig,
  deviceToken: string,
  notification: Notification,
  nowSecs: number,
): Promise<Delivery> {
  const token = await bearer(config, nowSecs);
  const body = JSON.stringify(apnsPayload(notification));
  const headers = {
    authorization: `bearer ${token}`,
    'apns-topic': config.topic,
    'apns-push-type': 'alert',
    'apns-priority': notification.urgency === 'low' ? '5' : '10',
    'apns-collapse-id': notification.id.slice(0, 64),
    'content-type': 'application/json',
  };

  let host: keyof typeof HOSTS = 'production';
  let response = await fetch(`${HOSTS[host]}/3/device/${deviceToken}`, {
    method: 'POST',
    headers,
    body,
  });
  let text = await response.text();

  // `BadDeviceToken` from production is far more often a development build than
  // a dead device. Believing it directly would evict a live phone, and the other
  // host is one request away.
  if (response.status === 400 && reasonOf(text) === 'BadDeviceToken') {
    host = 'sandbox';
    response = await fetch(`${HOSTS[host]}/3/device/${deviceToken}`, {
      method: 'POST',
      headers,
      body,
    });
    text = await response.text();
  }

  if (response.ok) return { ok: true, gone: false, status: response.status };

  const reason = reasonOf(text);
  // 410 is the documented "gone". The 400s that mean it are narrow on purpose:
  // the rest are OUR bug, and treating those as the device's fault would evict
  // every registered device the first time a payload was malformed.
  const gone =
    response.status === 410 ||
    (response.status === 400 &&
      ['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered'].includes(reason));
  return { ok: false, gone, status: response.status, reason };
}

/** Test seam: the module-level credential cache outlives a single request. */
export function resetTokenCache(): void {
  cached = null;
}
