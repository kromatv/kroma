import type { InviteCreated } from '@kromatv/client/accounts';
import type { AdminUser, InvitationState } from '@kromatv/client/admin';
import type { MessageKey } from '@kromatv/i18n';
import { useLocale, useT } from '@kromatv/ui';
import { Box, Button, Callout, Text, useConfirm } from '@kromatv/ui/kit';
import { useState } from 'react';
import { CopyableLink } from '#web/features/admin/copyable-link.component';
import { useAsyncAction } from '#web/features/admin/hooks';
import { useAuth } from '#web/shared/lib/auth';
import { invitationLink } from '#web/shared/lib/invitation-link';

const WAITS: Record<InvitationState, MessageKey> = {
  pending: 'admin.invitationWaitsPending',
  expired: 'admin.invitationWaitsExpired',
  none: 'admin.invitationWaitsNone',
};

function useReplaceConsent(user: AdminUser): () => Promise<boolean> {
  const t = useT();
  const confirm = useConfirm();
  return async () =>
    user.invitation !== 'pending' ||
    confirm({
      title: t('admin.invitationReplaceTitle'),
      message: t('admin.invitationReplaceMessage', { name: user.username }),
      confirmLabel: t('admin.invitationReplace'),
      cancelLabel: t('common.cancel'),
    });
}

function MintedLink({ minted }: Readonly<{ minted: InviteCreated }>) {
  const t = useT();
  const locale = useLocale();
  const until = new Date(minted.expiresAt * 1000).toLocaleDateString(locale);
  return (
    <Callout.Root tone="accent">
      <Callout.Title>{t('admin.inviteLink')}</Callout.Title>
      <CopyableLink label={t('admin.inviteLink')} link={invitationLink(minted)} />
      <Text variant="meta" color="textMuted">
        {t('admin.invitationUntil', { date: until })}
      </Text>
    </Callout.Root>
  );
}

function useMint(user: AdminUser, onMinted: () => void) {
  const t = useT();
  const { client } = useAuth();
  const consent = useReplaceConsent(user);
  const action = useAsyncAction();
  const [minted, setMinted] = useState<InviteCreated | null>(null);
  const make = async () => {
    setMinted(await client.admin.inviteUser(user.id));
    onMinted();
  };
  const mint = async () => {
    if (await consent()) {
      await action.run(make, () => t('admin.invitationMintFailed'));
    }
  };
  return { ...action, minted, mint };
}

interface WaitingInvitationProps {
  user: AdminUser;
  onMinted: () => void;
}

/** The invitation of an account that waits, which is the only way into it:
 * where it stands, and a new link that replaces it. */
export function WaitingInvitation({ user, onMinted }: Readonly<WaitingInvitationProps>) {
  const t = useT();
  const { busy, error, minted, mint } = useMint(user, onMinted);
  return (
    <Box gap={8}>
      <Text variant="overline" color="textDim">
        {t('admin.invitationSection')}
      </Text>
      <Text variant="meta" color="textMuted">
        {t(WAITS[user.invitation ?? 'none'])}
      </Text>
      <Box row>
        <Button
          variant="glass"
          size="sm"
          icon="link"
          label={t('admin.invitationMint')}
          onPress={() => void mint()}
          loading={busy}
        />
      </Box>
      {error ? (
        <Text variant="meta" color="danger">
          {error}
        </Text>
      ) : null}
      {minted ? <MintedLink minted={minted} /> : null}
    </Box>
  );
}
