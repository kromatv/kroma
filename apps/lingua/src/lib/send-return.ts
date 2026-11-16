import { z } from 'zod';

const SendFailure = z.enum([
  'missing',
  'busy',
  'incomplete',
  'conflict',
  'forking',
  'diverged',
  'other-account',
  'expired',
  'failed',
]);

/** Why a send opened no pull request. */
export type SendFailure = z.infer<typeof SendFailure>;

/** The sentence each failure reads as, on the page and in the API's answer. */
export const SEND_FAILURES: Record<SendFailure, string> = {
  missing: 'Lingua does not translate this project or language',
  busy: 'Wait a few seconds before sending again',
  incomplete: 'Translate the general form of each plural before its other forms',
  conflict:
    'Your branch conflicts with the default branch. A maintainer has to resolve it on GitHub.',
  forking: 'GitHub is still making your fork. Send again in a minute.',
  diverged:
    'The default branch of your fork conflicts with the project’s. Sync your fork on GitHub, then send again.',
  'other-account':
    'GitHub answered for another account than the one signed in here. Sign in again, then send.',
  expired: 'GitHub took too long to answer. Send again.',
  failed: 'GitHub refused the change. Try again in a minute.',
};

/** How a send that went to GitHub for the contributor's permission came back. */
export type Returned =
  | { kind: 'sent'; number: number }
  | { kind: 'nothing' }
  | { kind: 'declined' }
  | { kind: 'failed'; reason: SendFailure };

const Code = z.union([z.enum(['nothing', 'declined']), SendFailure]);

function queryOf(returned: Returned): Record<string, string> {
  if (returned.kind === 'sent') {
    return { sent: String(returned.number) };
  }
  return { send: returned.kind === 'failed' ? returned.reason : returned.kind };
}

/** The page `to`, saying how a send came back. */
export function returnAddress(to: string, returned: Returned): string {
  const url = new URL(to, 'https://lingua.invalid');
  for (const [name, value] of Object.entries(queryOf(returned))) {
    url.searchParams.set(name, value);
  }
  return `${url.pathname}${url.search}`;
}

/** How a send came back, read off the query of the page it returned to, or null when it says nothing about one. */
export function returnedFrom(search: string): Returned | null {
  const query = new URLSearchParams(search);
  const sent = Number(query.get('sent'));
  if (Number.isInteger(sent) && sent > 0) {
    return { kind: 'sent', number: sent };
  }
  const code = Code.safeParse(query.get('send'));
  if (!code.success) {
    return null;
  }
  if (code.data === 'nothing' || code.data === 'declined') {
    return { kind: code.data };
  }
  return { kind: 'failed', reason: code.data };
}
