import type { AdminUser } from '@kromatv/client/admin';
import type { LibraryId } from '@kromatv/client/media';
import { useT } from '@kromatv/ui';
import { Box, Button, Dialog, Field, Text, useConfirm } from '@kromatv/ui/kit';
import { useState } from 'react';
import { createCallable } from 'react-call';
import { LibraryVisibility } from '#web/features/admin/library-visibility.component';
import { useAsyncAction } from '#web/features/admin/hooks';
import { ProfileRestrictions } from '#web/features/admin/profile-restrictions.component';
import { useAuth } from '#web/shared/lib/auth';
import { AccountLinks } from '#web/features/admin/users-account-links.component';
import { WaitingInvitation } from '#web/features/admin/users-invitation.component';
import { PermPicker, usePermissionSet } from '#web/features/admin/users-permissions';

/** Edit a user (name, permissions, library visibility, email verification,
 * access recovery, with a guarded delete). An account that waits gets its
 * invitation instead of a reset. Resolves `true` when the user was saved,
 * deleted or given a new invitation (the caller refreshes), `false` on
 * dismiss. */
export const EditUserModal = createCallable<{ user: AdminUser }, boolean>(({ call, user }) => {
  const confirm = useConfirm();
  const t = useT();
  const { client, user: me } = useAuth();
  const [name, setName] = useState(user.username);
  const [perms, toggle] = usePermissionSet(user.permissions);
  const [granted, setGranted] = useState<readonly LibraryId[] | null>(user.libraries);
  const { busy, error, run } = useAsyncAction();
  const isSelf = me?.id === user.id;
  const [invited, setInvited] = useState(false);

  const save = () =>
    run(
      async () => {
        await client.admin.updateUser(user.id, {
          permissions: [...perms],
          username: name.trim(),
          libraries: granted === null ? null : [...granted],
        });
        call.end(true);
      },
      () => t('admin.updateFailed'),
    );

  const remove = async () => {
    const ok = await confirm({
      title: t('admin.deleteAccount'),
      message: t('admin.confirmDeleteUser', { name: user.username }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) {
      return;
    }
    await run(
      async () => {
        await client.admin.deleteUser(user.id);
        call.end(true);
      },
      () => t('admin.deleteFailed'),
    );
  };

  return (
    <Dialog.Root
      open
      title={t('admin.editUser', { name: user.username })}
      onClose={() => call.end(invited)}
      width="lg"
    >
      <Field.Root label={t('admin.name')}>
        <Field.Input icon="user" value={name} onValueChange={setName} />
      </Field.Root>
      <Box>
        <Text variant="overline" color="textDim" mb={8}>
          {t('admin.permissions')}
        </Text>
        <PermPicker selected={perms} toggle={toggle} />
        {error ? (
          <Text variant="meta" color="danger" mt={12}>
            {error}
          </Text>
        ) : null}
      </Box>

      <LibraryVisibility granted={granted} onChange={setGranted} />

      <ProfileRestrictions user={user} />

      {user.invitation ? (
        <WaitingInvitation user={user} onMinted={() => setInvited(true)} />
      ) : (
        <AccountLinks user={user} />
      )}

      <Dialog.Footer>
        <Dialog.Actions
          onCancel={() => call.end(invited)}
          cancelLabel={t('common.cancel')}
          onConfirm={() => void save()}
          confirmLabel={busy ? t('common.saving') : t('common.save')}
          busy={busy}
        >
          <Button
            variant="dangerGhost"
            size="sm"
            label={t('admin.deleteAccount')}
            onPress={() => {
              void remove();
            }}
            disabled={busy || isSelf}
          />
        </Dialog.Actions>
      </Dialog.Footer>
    </Dialog.Root>
  );
});
