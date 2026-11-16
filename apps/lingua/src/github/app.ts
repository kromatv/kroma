import { z } from 'zod';
import { appJwt } from './app-jwt';
import { type GitHub, gitHub } from './client';

/** The GitHub App Lingua syncs repositories as, hears webhooks from, and sends as when a contributor sends through Lingua. Every value is a `wrangler secret`. */
export interface AppCredentials {
  appId: string;
  privateKey: string;
  webhookSecret: string;
}

const Token = z.object({ token: z.string(), expires_at: z.string() });

const cache = new Map<number, { token: string; expiresAt: number }>();

/** Speak as the App itself, to list where it is installed. */
export async function asApp(app: AppCredentials, fetchFn: typeof fetch = fetch): Promise<GitHub> {
  const jwt = await appJwt(app.appId, app.privateKey, Math.floor(Date.now() / 1000));
  return gitHub(`Bearer ${jwt}`, fetchFn);
}

/** Speak as one installation of the App, with the repository access its owner granted. */
export async function asInstallation(
  app: AppCredentials,
  installationId: number,
  fetchFn: typeof fetch = fetch,
): Promise<GitHub> {
  const held = cache.get(installationId);
  if (held && held.expiresAt - Date.now() > 5 * 60_000) {
    return gitHub(`Bearer ${held.token}`, fetchFn);
  }
  const minted = await (
    await asApp(app, fetchFn)
  ).send({ method: 'POST', path: `/app/installations/${installationId}/access_tokens` }, Token);
  cache.set(installationId, { token: minted.token, expiresAt: Date.parse(minted.expires_at) });
  return gitHub(`Bearer ${minted.token}`, fetchFn);
}
