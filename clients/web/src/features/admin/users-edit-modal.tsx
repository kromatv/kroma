import type { ResetCreated, VerificationCreated } from '@kromatv/client/accounts';
import type { AdminUser } from '@kromatv/client/admin';
import type { LibraryId } from '@kromatv/client/media';
import { useT } from '@kromatv/ui';
import {
  Box,
  Button,
  Callout,
  Dialog,
  Field,
  Icon,
  ListRow,
  Row,
  resolveStyles,
  Text,
  useConfirm,
  useStyleScope,
  useThemeVersion,
} from '@kromatv/ui/kit';
import { useState } from 'react';
import { createCallable } from 'react-call';
import { LibraryVisibility } from '#web/features/admin/library-visibility';
import { useAsyncAction } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';
import { usersStyles } from '#web/features/admin/users-styles';
import { LinkResult } from '#web/features/admin/users-link-result';
import { PermPicker, usePermissionSet } from '#web/features/admin/users-permissions';

/** Edit a user (name, permissions, library visibility, email verification,
 * access recovery, with a guarded delete). Resolves `true` when the user was
 * saved or deleted (the caller refreshes), `false` on dismiss. */
export const EditUserModal = createCallable<{ user: AdminUser }, boolean>(({ call, user }) => {
  const scope = useStyleScope();
  useThemeVersion();
  const confirm = useConfirm();
  const t = useT();
  const { client, user: me } = useAuth();
  const [name, setName] = useState(user.username);
  const [perms, toggle] = usePermissionSet(user.permissions);
  const [granted, setGranted] = useState<readonly LibraryId[] | null>(user.libraries);
  const { busy, error, run } = useAsyncAction();
  const isSelf = me?.id === user.id;
  const [reset, setReset] = useState<ResetCreated | null>(null);
  const [verification, setVerification] = useState<VerificationCreated | null>(null);
  const [pinCleared, setPinCleared] = useState(false);

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
    if (!ok) return;
    await run(
      async () => {
        await client.admin.deleteUser(user.id);
        call.end(true);
      },
      () => t('admin.deleteFailed'),
    );
  };

  const resetAccess = async () => {
    const ok = await confirm({
      title: t('admin.resetAccess'),
      message: t('admin.resetUserConfirm', { name: user.username }),
      confirmLabel: t('admin.resetAccess'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    await run(
      async () => setReset(await client.admin.resetUser(user.id)),
      () => t('admin.resetAccessFailed'),
    );
  };

  const sendVerification = () =>
    run(
      async () => setVerification(await client.admin.sendEmailVerification(user.id)),
      () => t('admin.verificationFailed'),
    );

  const clearPin = async () => {
    const ok = await confirm({
      title: t('admin.clearPin'),
      message: t('admin.confirmClearPin', { name: user.username }),
      confirmLabel: t('admin.clearPin'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    await run(
      async () => {
        await client.admin.clearUserPin(user.id);
        setPinCleared(true);
      },
      () => t('admin.updateFailed'),
    );
  };

  return (
    <Dialog.Root
      open
      title={t('admin.editUser', { name: user.username })}
      onClose={() => call.end(false)}
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

      <Box>
        <Text variant="overline" color="textDim" mb={8}>
          {t('admin.email')}
        </Text>
        <ListRow.Root size="md">
          <ListRow.Leading>
            <Icon name="mail" size={18} thickness={1.8} color="textDim" />
          </ListRow.Leading>
          <ListRow.Label>{user.email}</ListRow.Label>
          <ListRow.Hint>
            {user.emailVerified ? t('admin.emailVerified') : t('admin.emailUnverified')}
          </ListRow.Hint>
          <ListRow.Trailing>
            <Button
              variant="glass"
              size="sm"
              label={t('admin.sendVerification')}
              onPress={() => void sendVerification()}
              disabled={busy}
            />
          </ListRow.Trailing>
        </ListRow.Root>
        {verification ? (
          <Callout.Root tone="accent">
            <Callout.Title>{t('admin.verificationLink')}</Callout.Title>
            <LinkResult
              kind="verify"
              label={t('admin.verificationLink')}
              url={verification.url}
              token={verification.token}
              delivered={verification.delivered}
            />
          </Callout.Root>
        ) : null}
      </Box>

      <Box>
        <Text variant="overline" color="textDim" mb={8}>
          {t('admin.accessSection')}
        </Text>
        {user.resetRequested ? (
          <Box mb={12}>
            <Callout.Root tone="accent" size="sm" icon="info-circle">
              <Callout.Title>{t('admin.resetRequested')}</Callout.Title>
              <Callout.Detail>{t('admin.resetRequestedHint')}</Callout.Detail>
            </Callout.Root>
          </Box>
        ) : null}
        <Row gap={8} wrap>
          <Button
            variant="glass"
            size="sm"
            icon="key"
            label={t('admin.resetAccess')}
            onPress={() => void resetAccess()}
            disabled={busy}
          />
          <Button
            variant="glass"
            size="sm"
            icon="lock"
            label={pinCleared ? t('admin.pinCleared') : t('admin.clearPin')}
            onPress={() => void clearPin()}
            disabled={busy || pinCleared || !user.hasPin}
          />
        </Row>
        <Text variant="meta" color="textDim" mt={8}>
          {t('admin.resetAccessHint')}
        </Text>
        {reset ? (
          <Callout.Root tone="accent">
            <Callout.Title>{t('admin.resetCode')}</Callout.Title>
            <Text
              variant="heading"
              textAlign="center"
              style={resolveStyles(usersStyles, scope).code}
            >
              {reset.code}
            </Text>
            <Text variant="meta" color="textMuted">
              {t('admin.resetCodeHint')}
            </Text>
            <LinkResult
              kind="reset"
              label={t('admin.resetLink')}
              url={reset.url}
              token={reset.token}
              delivered={reset.delivered}
              code={reset.code}
            />
          </Callout.Root>
        ) : null}
      </Box>

      <Dialog.Footer>
        <Dialog.Actions
          onCancel={() => call.end(false)}
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
