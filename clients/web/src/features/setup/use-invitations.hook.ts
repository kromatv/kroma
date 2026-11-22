import type { Invite, InviteCreated, InviteToken, Permission } from '@kromatv/client/accounts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { invitationLink } from '#web/shared/lib/invitation-link';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

const INVITES = ['setup', 'invites'] as const;

/** The invitations nobody has redeemed yet. */
export function openInvitations(invites: readonly Invite[]): Invite[] {
  return invites.filter((invite) => !invite.used);
}

/** The address that opens the owner's mail program on a message that carries
 * an invitation. */
export function invitationMail(words: { subject: string; body: string }): string {
  return `mailto:?subject=${encodeURIComponent(words.subject)}&body=${encodeURIComponent(words.body)}`;
}

function useCreatedLinks() {
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const keep = (created: InviteCreated) =>
    setUrls((before) => ({ ...before, [created.token]: created.url }));
  const linkOf = (invite: Invite) =>
    invitationLink({ url: urls[invite.token] ?? null, token: invite.token });
  return { keep, linkOf };
}

/** The invitations the server holds, and what the owner does with them. An
 * invitation cannot change once it exists, so new rights make a new link and
 * the old one stops working. */
export function useInvitations() {
  const { client } = useWebRuntime();
  const queryClient = useQueryClient();
  const { keep, linkOf } = useCreatedLinks();
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({ queryKey: INVITES, queryFn: () => client.accounts.invites() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: INVITES });
  const create = async (permissions?: Permission[]) => {
    setBusy(true);
    try {
      const created = await client.accounts.createInvite({ permissions });
      keep(created);
    } finally {
      setBusy(false);
      await refresh();
    }
  };
  const revoke = async (token: InviteToken) => {
    await client.accounts.revokeInvite(token).catch(() => undefined);
    await refresh();
  };
  const change = async (token: InviteToken, permissions: Permission[]) => {
    await client.accounts.revokeInvite(token);
    await create(permissions);
  };
  return { open: openInvitations(data ?? []), busy, create, revoke, change, linkOf };
}
