import type { FlowResult } from '@kromatv/client/sso';

const REFUSALS = [
  'group',
  'blocked',
  'full',
  'noEmail',
  'inviteInvalid',
  'linkedElsewhere',
] as const;

/** The messages the return page can show. Each has a `sso.<message>.title` and
 * a `sso.<message>.body`. */
export type SsoMessage =
  | 'elsewhere'
  | 'expired'
  | 'requested'
  | 'emailTaken'
  | 'invitationOnly'
  | 'claimFailed'
  | 'failed'
  | 'failedDenied'
  | `refused.${(typeof REFUSALS)[number]}`;

function isRefusal(reason: string): reason is (typeof REFUSALS)[number] {
  return (REFUSALS as readonly string[]).includes(reason);
}

/** The message for a flow that ended with nobody signed in. A reason this
 * client does not know reads as a failure, never as a blank screen. */
export function ssoMessage(result: FlowResult): SsoMessage {
  if (result.status === 'refused' && isRefusal(result.reason)) return `refused.${result.reason}`;
  if (result.status === 'failed' && result.reason === 'provider.access_denied') {
    return 'failedDenied';
  }
  if (result.status === 'failed' || result.status === 'refused') return 'failed';
  return 'expired';
}
