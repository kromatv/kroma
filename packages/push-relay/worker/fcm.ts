// FCM v1 does not take the service account directly: the key signs a JWT-bearer assertion,
// which Google's token endpoint trades for the short-lived OAuth2 access token that authorises
// the send.

import { z } from 'zod';
import { importRs256, sign } from './jwt';
import type { Notification } from './notification';
import { fcmMessage } from './notification';
import type { Delivery } from './schemas';

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
// Google issues these for an hour; refresh early so a send never races expiry.
const TOKEN_LIFETIME_SECS = 50 * 60;

// `.loose()` so a key Google adds to the service-account file later is kept, not rejected.
const ServiceAccount = z
  .object({
    project_id: z.string().min(1),
    client_email: z.string().min(1),
    private_key: z.string().min(1),
  })
  .loose();
type ServiceAccount = z.infer<typeof ServiceAccount>;

let cached: { token: string; mintedAt: number; email: string } | null = null;

let parsed: { json: string; account: ServiceAccount } | null = null;

export function parseServiceAccount(json: string): ServiceAccount {
  if (parsed?.json === json) return parsed.account;
  const account = ServiceAccount.parse(JSON.parse(json));
  parsed = { json, account };
  return account;
}

async function accessToken(account: ServiceAccount, nowSecs: number): Promise<string> {
  if (cached?.email === account.client_email && nowSecs - cached.mintedAt < TOKEN_LIFETIME_SECS) {
    return cached.token;
  }
  const key = await importRs256(account.private_key);
  const assertion = await sign(
    key,
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: account.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: nowSecs,
      exp: nowSecs + 3600,
    },
  );
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) {
    throw new Error(`token endpoint returned ${response.status}: ${await response.text()}`);
  }
  const { access_token } = (await response.json()) as { access_token?: string };
  if (!access_token) throw new Error('token endpoint returned no access_token');
  cached = { token: access_token, mintedAt: nowSecs, email: account.client_email };
  return access_token;
}

export async function send(
  account: ServiceAccount,
  deviceToken: string,
  notification: Notification,
  nowSecs: number,
): Promise<Delivery> {
  const token = await accessToken(account, nowSecs);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(fcmMessage(notification, deviceToken)),
    },
  );
  if (response.ok) return { ok: true, gone: false, status: response.status };

  const text = await response.text();
  // Google's vocabulary for a dead token: 404/410, or UNREGISTERED in the body.
  const gone = response.status === 404 || response.status === 410 || text.includes('UNREGISTERED');
  return { ok: false, gone, status: response.status, reason: text.slice(0, 200) };
}

/** Test seam: the module-level credential cache outlives a single request. */
export function resetTokenCache(): void {
  cached = null;
}
