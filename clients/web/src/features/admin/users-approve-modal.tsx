import { apiErrorText } from '@kromatv/client';
import type { LibraryId } from '@kromatv/client/media';
import type { JoinRequest } from '@kromatv/client/sso';
import { useT } from '@kromatv/ui';
import { Box, Dialog, Field, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { createCallable } from 'react-call';
import { LibraryVisibility } from '#web/features/admin/library-visibility';
import { useAsyncAction } from '#web/features/admin/shell';
import { PermPicker, usePermissionSet } from '#web/features/admin/users-permissions';
import { useAuth } from '#web/shared/lib/auth';

/** Approve a join request: name the account and choose what it may do and
 * see. Resolves `true` when the account was created, `false` on dismiss. */
export const ApproveJoinModal = createCallable<{ request: JoinRequest }, boolean>(
  ({ call, request }) => {
    const t = useT();
    const { client } = useAuth();
    const [name, setName] = useState(request.username);
    const [perms, toggle] = usePermissionSet(['playback']);
    const [granted, setGranted] = useState<readonly LibraryId[] | null>(null);
    const { busy, error, run } = useAsyncAction();

    const approve = () =>
      run(
        async () => {
          await client.sso.approve(request.id, {
            username: name.trim(),
            permissions: [...perms],
            libraries: granted === null ? null : [...granted],
          });
          call.end(true);
        },
        (e) => apiErrorText(e, t('admin.joinApproveFailed')),
      );

    return (
      <Dialog.Root
        open
        title={t('admin.joinApproveTitle', { name: request.name ?? request.username })}
        onClose={() => call.end(false)}
        width="lg"
      >
        <Text variant="meta" color="textDim">
          {t('admin.joinApproveIntro', { email: request.email, provider: request.provider })}
        </Text>
        <Field.Root label={t('admin.name')}>
          <Field.Input icon="user" value={name} onValueChange={setName} />
        </Field.Root>
        <Box>
          <PermPicker selected={perms} toggle={toggle} />
          {error ? (
            <Text variant="meta" color="danger" mt={12}>
              {error}
            </Text>
          ) : null}
        </Box>
        <LibraryVisibility granted={granted} onChange={setGranted} />
        <Dialog.Footer>
          <Dialog.Actions
            onCancel={() => call.end(false)}
            cancelLabel={t('common.cancel')}
            onConfirm={() => void approve()}
            confirmLabel={busy ? t('common.creating') : t('admin.joinApprove')}
            busy={busy}
            disabled={perms.size === 0 || !name.trim()}
          />
        </Dialog.Footer>
      </Dialog.Root>
    );
  },
);
