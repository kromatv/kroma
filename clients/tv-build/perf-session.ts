#!/usr/bin/env bun
// Print a signed-in TV session as JSON, for perf-profile.ts to seed.
//
// Profiling the browse screens needs a populated home, which needs an account.
// Rather than driving the sign-in flow (which is a different thing to measure,
// and slow), this registers a throwaway profile against a running dev server and
// prints exactly the localStorage the TV app boots from.
//
//   bun clients/tv-build/perf-profile.ts \
//     --session "$(bun clients/tv-build/perf-session.ts)"
//
// Registration is invite-only after the first account, so an existing owner's
// token is needed to mint one (KROMA_ADMIN_TOKEN); with no invite this falls
// back to registering as the first account, which is what a fresh dev server
// wants.

const SERVER = process.env.KROMA_SERVER ?? 'http://localhost:4040';
const ADMIN = process.env.KROMA_ADMIN_TOKEN ?? '';
const USER = process.env.KROMA_PERF_USER ?? 'perfbot';
const PASS = process.env.KROMA_PERF_PASS ?? 'perfbot-passw0rd';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SERVER}/api${path}`, init);
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const json = { 'content-type': 'application/json' };

/** Sign in if the profile already exists, otherwise create it. */
async function session(): Promise<{ accessToken: string; user: unknown }> {
  try {
    return await api('/auth/login', {
      method: 'POST',
      headers: json,
      // The server names the field `email`, and accepts a username in it.
      body: JSON.stringify({ email: USER, password: PASS }),
    });
  } catch {
    const invite = ADMIN
      ? await api<{ token: string }>('/invites', {
          method: 'POST',
          headers: { ...json, authorization: `Bearer ${ADMIN}` },
          body: JSON.stringify({ permissions: ['playback'] }),
        })
      : null;
    return api('/auth/register', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({
        email: `${USER}@kroma.local`,
        username: USER,
        password: PASS,
        inviteToken: invite?.token,
      }),
    });
  }
}

const { accessToken, user } = await session();
const stored = { accessToken, user, serverUrl: SERVER };

console.log(
  JSON.stringify({
    'kroma.session': JSON.stringify(stored),
    'kroma.accounts': JSON.stringify([stored]),
    'kroma.servers': JSON.stringify([{ url: SERVER, lastUsedAt: 1 }]),
  }),
);
