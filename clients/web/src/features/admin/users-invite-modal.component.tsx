import { useT } from '@kromatv/ui';
import { Box, Callout, Dialog, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { createCallable } from 'react-call';
import { CopyableLink } from '#web/features/admin/copyable-link.component';
import { useAsyncAction } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';
import { invitationLink } from '#web/shared/lib/invitation-link';
import { PermPicker, usePermissionSet } from '#web/features/admin/users-permissions';

/** Create an invite link. Resolves `true` if an invite was created (the caller
 * refreshes the pending list), `false` if dismissed without creating one. */
export const InviteModal = createCallable<void, boolean>(({ call }) => {
  const t = useT();
  const { client } = useAuth();
  const [perms, toggle] = usePermissionSet(['playback']);
  const [link, setLink] = useState<string | null>(null);
  const { busy, run } = useAsyncAction();
  const close = () => call.end(link !== null);

  const create = () =>
    run(async () => {
      setLink(invitationLink(await client.accounts.createInvite({ permissions: [...perms] })));
    });

  return (
    <Dialog.Root open title={t('nav.inviteUser')} onClose={close} width="lg">
      <Box>
        <Text variant="meta" color="textDim" mb={16}>
          {t('admin.inviteIntro')}
        </Text>
        <PermPicker selected={perms} toggle={toggle} />
      </Box>
      {link ? (
        <Callout.Root tone="accent">
          <Callout.Title>{t('admin.inviteLink')}</Callout.Title>
          <CopyableLink label={t('admin.inviteLink')} link={link} />
        </Callout.Root>
      ) : null}
      <Dialog.Footer>
        {link ? (
          <Dialog.Actions onCancel={close} cancelLabel={t('common.close')} />
        ) : (
          <Dialog.Actions
            onCancel={close}
            cancelLabel={t('common.cancel')}
            onConfirm={() => void create()}
            confirmLabel={busy ? t('common.creating') : t('admin.createLink')}
            busy={busy}
            disabled={perms.size === 0}
          />
        )}
      </Dialog.Footer>
    </Dialog.Root>
  );
});
