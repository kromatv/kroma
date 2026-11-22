import { apiErrorText } from '@kromatv/client';
import type { Delivery, InviteToken } from '@kromatv/client/accounts';
import { useLocale, useT } from '@kromatv/ui';
import { useState } from 'react';
import { useAuth } from '#web/shared/lib/auth';

/** What became of one invitation sent to one address: how it left, or why it
 * could not. */
export type MailOutcome =
  | { kind: 'delivered'; delivered: Delivery; to: string }
  | { kind: 'failed'; reason: string };

/** Sends the invitation `token` names, in the language the page is read in. */
export function useInvitationMail(token: InviteToken) {
  const t = useT();
  const locale = useLocale();
  const { client } = useAuth();
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<MailOutcome | null>(null);
  const send = async (address: string) => {
    const to = address.trim();
    setSending(true);
    try {
      const { delivered } = await client.accounts.mailInvite(token, { to, locale });
      setOutcome({ kind: 'delivered', delivered, to });
    } catch (cause) {
      setOutcome({ kind: 'failed', reason: apiErrorText(cause, t('admin.invitationMailFailed')) });
    } finally {
      setSending(false);
    }
  };
  return { sending, outcome, send };
}

/** Whether `address` reads as a mailbox worth sending to. */
export function plausibleAddress(address: string): boolean {
  const trimmed = address.trim();
  return /^[^\s@]+@[^\s@]+$/.test(trimmed);
}
