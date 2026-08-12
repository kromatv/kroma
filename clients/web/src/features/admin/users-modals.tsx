import { type AdminUser, type Invite, PERMISSIONS, type Permission } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Box,
  Button,
  Callout,
  ChoiceList,
  color,
  confirm,
  Dialog,
  Field,
  Icon,
  InputGroup,
  ListRow,
  Row,
  Text,
} from '@kroma/ui/kit';
import { useCallback, useState } from 'react';
import { createCallable } from 'react-call';
import { useAsyncAction } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';

const DASHED = { borderWidth: 1, borderColor: color('text/25'), borderStyle: 'dashed' } as const;

export function PendingInvite({ inv, onChange }: Readonly<{ inv: Invite; onChange: () => void }>) {
  const t = useT();
  const { client } = useAuth();
  const [copied, setCopied] = useState(false);
  async function resend() {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    try {
      await navigator.clipboard.writeText(`${origin}/join?invite=${inv.token}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }
  return (
    <ListRow.Root size="md">
      <ListRow.Label>{inv.permissions.join(', ') || t('admin.permPlayback')}</ListRow.Label>
      <ListRow.Hint>
        {t('admin.expiresOn', {
          date: new Date(inv.expiresAt * 1000).toLocaleDateString('fr-FR'),
        })}
      </ListRow.Hint>
      <ListRow.Leading>
        <Row center w={42} h={42} shrink={0} radius="circle" style={DASHED}>
          <Icon name="mail" size={18} stroke={1.8} color="textDim" />
        </Row>
      </ListRow.Leading>
      <ListRow.Trailing>
        <Button
          variant="glass"
          size="sm"
          label={copied ? t('common.linkCopied') : t('admin.resend')}
          onPress={() => void resend()}
        />
        <Button
          variant="danger"
          size="sm"
          label={t('common.cancel')}
          onPress={() => void client.revokeInvite(inv.token).then(onChange)}
        />
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

function PermPicker({
  selected,
  toggle,
}: Readonly<{
  selected: Set<Permission>;
  toggle: (p: Permission) => void;
}>) {
  const t = useT();
  return (
    <ChoiceList.Root
      mode="multiple"
      size="sm"
      label={t('admin.permissions')}
      value={[...selected]}
      onValueChange={(next) => toggle(diff(selected, next))}
    >
      {PERMISSIONS.map((p) => (
        <ChoiceList.Item key={p.key} value={p.key}>
          <ChoiceList.Label>{t(p.labelKey)}</ChoiceList.Label>
          <ChoiceList.Hint>{t(p.hintKey)}</ChoiceList.Hint>
        </ChoiceList.Item>
      ))}
    </ChoiceList.Root>
  );
}

// <ChoiceList> reports the whole next selection; the caller's toggle takes the
// one entry that moved.
function diff(before: Set<Permission>, after: string[]): Permission {
  const added = after.find((p) => !before.has(p as Permission));
  if (added) return added as Permission;
  return [...before].find((p) => !after.includes(p)) as Permission;
}

function usePermissionSet(
  initial: Iterable<Permission>,
): [Set<Permission>, (p: Permission) => void] {
  const [perms, setPerms] = useState<Set<Permission>>(() => new Set(initial));
  const toggle = useCallback((p: Permission) => {
    setPerms((s) => {
      const next = new Set(s);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }, []);
  return [perms, toggle];
}

/** Edit a user (name + permissions, with a guarded delete). Resolves `true` when
 * the user was saved or deleted (the caller refreshes), `false` on dismiss. */
export const EditUserModal = createCallable<{ user: AdminUser }, boolean>(({ call, user }) => {
  const t = useT();
  const { client, user: me } = useAuth();
  const [name, setName] = useState(user.username);
  const [perms, toggle] = usePermissionSet(user.permissions);
  const { busy, error, run } = useAsyncAction();
  const isSelf = me?.id === user.id;

  const save = () =>
    run(
      async () => {
        await client.updateUser(user.id, { permissions: [...perms], username: name.trim() });
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
    run(
      async () => {
        await client.deleteUser(user.id);
        call.end(true);
      },
      () => t('admin.deleteFailed'),
    );
  };

  return (
    <Dialog.Root
      open
      title={t('admin.editUser', { name: user.username })}
      onClose={() => call.end(false)}
      width={460}
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
      <Dialog.Actions
        onCancel={() => call.end(false)}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          save();
        }}
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
    </Dialog.Root>
  );
});

/** Create an invite link. Resolves `true` if an invite was created (the caller
 * refreshes the pending list), `false` if dismissed without creating one. */
export const InviteModal = createCallable<void, boolean>(({ call }) => {
  const t = useT();
  const { client } = useAuth();
  const [perms, toggle] = usePermissionSet(['playback']);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { busy, run } = useAsyncAction();
  const close = () => call.end(link !== null);

  const create = () =>
    run(async () => {
      const res = await client.createInvite({ permissions: [...perms] });
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      setLink(res.url ?? `${origin}/join?invite=${res.token}`);
    });

  // `navigator.clipboard` is undefined outside a secure context, so on a
  // plain-http LAN address this throws synchronously, not via rejection.
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (insecure context) or blocked */
    }
  }

  return (
    <Dialog.Root open title={t('nav.inviteUser')} onClose={close} width={460}>
      <Box>
        <Text variant="meta" color="textDim" mb={16}>
          {t('admin.inviteIntro')}
        </Text>
        <PermPicker selected={perms} toggle={toggle} />
      </Box>
      {link ? (
        <Callout.Root tone="accent">
          <Callout.Title>{t('admin.inviteLink')}</Callout.Title>
          <InputGroup.Root label={t('admin.inviteLink')}>
            <InputGroup.Input value={link} autoFocus={false} />
            <InputGroup.Addon align="inline-end">
              <InputGroup.Button
                icon="copy"
                label={copied ? t('common.copied') : t('common.copy')}
                onPress={() => void copy(link)}
              />
            </InputGroup.Addon>
          </InputGroup.Root>
        </Callout.Root>
      ) : (
        <Dialog.Actions
          onCancel={close}
          cancelLabel={t('common.cancel')}
          onConfirm={() => {
            create();
          }}
          confirmLabel={busy ? t('common.creating') : t('admin.createLink')}
          busy={busy}
          disabled={perms.size === 0}
        />
      )}
    </Dialog.Root>
  );
});
