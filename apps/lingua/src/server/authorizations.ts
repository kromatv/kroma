import { z } from 'zod';
import type { GitHub } from '#site/github/client';
import {
  authorizeUrl,
  type Granted,
  grantFromCode,
  type OAuthCredentials,
} from '#site/github/oauth';
import { returnAddress, type Returned } from '#site/lib/send-return';
import type { User } from '#site/store/store';
import { report } from './log';
import { ProposalInput, type ProposalResult } from './proposals';
import { cookie, readCookie } from './session';

const SEND_COOKIE = '__Host-lingua_send';
const TEN_MINUTES = 600;
const WRITE_SCOPES = new Set(['public_repo', 'repo']);

const Pending = ProposalInput.extend({
  state: z.string().nonempty(),
  to: z.string().startsWith('/'),
});

/** A send waiting on GitHub: the state tying GitHub's answer to this browser, what to send, and the page to return to. */
export type PendingSend = z.infer<typeof Pending>;

/** The `Set-Cookie` that remembers `pending` for the trip to GitHub and back. */
export function pendingCookie(pending: PendingSend): string {
  return cookie(SEND_COOKIE, JSON.stringify(pending), TEN_MINUTES);
}

/** The `Set-Cookie` that forgets the send once GitHub answered. */
export function forgetPending(): string {
  return cookie(SEND_COOKIE, '', 0);
}

/** The send this browser is waiting on GitHub for, or null. */
export function readPending(cookieHeader: string | null | undefined): PendingSend | null {
  const raw = readCookie(cookieHeader, SEND_COOKIE);
  if (!raw) {
    return null;
  }
  try {
    const parsed = Pending.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Where to send the browser so GitHub asks `login` to let Lingua fork and open pull requests as them, `public_repo` and nothing more. */
export function askToSend(
  oauth: OAuthCredentials,
  pending: PendingSend,
  at: { redirectUri: string; login: string },
): string {
  return authorizeUrl(oauth, {
    redirectUri: at.redirectUri,
    state: pending.state,
    scope: 'public_repo',
    login: at.login,
  });
}

/** GitHub's answer to a send, and how to carry it out: `send` runs it as the account that granted it. */
export interface SendAnswer {
  oauth: OAuthCredentials;
  pending: PendingSend;
  viewer: User | null;
  query: { code: string | undefined; error: string | undefined };
  redirectUri: string;
  send: (as: GitHub, user: User) => Promise<ProposalResult>;
  fetchFn?: typeof fetch;
}

function returnedOf(result: ProposalResult): Returned {
  if (result.status !== 200) {
    return { kind: 'failed', reason: result.reason };
  }
  return result.body.kind === 'proposed'
    ? { kind: 'sent', number: result.body.number }
    : { kind: 'nothing' };
}

async function grant(answer: SendAnswer, code: string): Promise<Granted | null> {
  return grantFromCode(
    answer.oauth,
    { code, redirectUri: answer.redirectUri },
    answer.fetchFn,
  ).catch((error: unknown) => {
    report('GitHub did not grant the send', error);
    return null;
  });
}

async function settle(answer: SendAnswer): Promise<Returned> {
  const { query, viewer } = answer;
  if (query.error === 'access_denied') {
    return { kind: 'declined' };
  }
  if (!viewer || !query.code) {
    return { kind: 'failed', reason: 'expired' };
  }
  const granted = await grant(answer, query.code);
  if (!granted) {
    return { kind: 'failed', reason: 'failed' };
  }
  if (!granted.scopes.some((scope) => WRITE_SCOPES.has(scope))) {
    return { kind: 'declined' };
  }
  if (granted.user.id !== viewer.id) {
    return { kind: 'failed', reason: 'other-account' };
  }
  return returnedOf(await answer.send(granted.gh, viewer));
}

/**
 * Read GitHub's answer to a send and, when the signed-in contributor granted
 * `public_repo`, send as them. Returns the page to go back to, saying how it
 * went. The token lives in the client `send` receives and goes with it.
 */
export async function answerSend(answer: SendAnswer): Promise<string> {
  return returnAddress(answer.pending.to, await settle(answer));
}
