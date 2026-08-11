import { type AdminUser, type Invite, PERMISSIONS, type Permission } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Button, Callout, confirm, Dialog, Field, InputGroup, ListRow } from '@kroma/ui/kit';
import { IconMail } from '@tabler/icons-react';
import { useCallback, useState } from 'react';
import { createCallable } from 'react-call';
import { useAsyncAction } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';

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
    <ListRow.Root
      size="md"
      label={inv.permissions.join(', ') || t('admin.permPlayback')}
      hint={t('admin.expiresOn', {
        date: new Date(inv.expiresAt * 1000).toLocaleDateString('fr-FR'),
      })}
    >
      <ListRow.Leading>
        <span className="flex h-10.5 w-10.5 shrink-0 items-center justify-center rounded-full border border-dashed border-text/25">
          <IconMail size={18} stroke={1.8} className="text-text/50" />
        </span>
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
    <div className="flex flex-col gap-2">
      {PERMISSIONS.map((p) => (
        <label
          key={p.key}
          aria-label={t(p.labelKey)}
          className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/3"
        >
          <input
            type="checkbox"
            checked={selected.has(p.key)}
            onChange={() => toggle(p.key)}
            className="h-4 w-4 accent-(--kroma-accent)"
          />
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold">{t(p.labelKey)}</span>
            <span className="block text-[12px] text-dim">{t(p.hintKey)}</span>
          </span>
        </label>
      ))}
    </div>
  );
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
    <Dialog
      open
      title={t('admin.editUser', { name: user.username })}
      onClose={() => call.end(false)}
      width={460}
    >
      <Field.Root label={t('admin.name')}>
        <Field.Input icon="user" value={name} onValueChange={setName} />
      </Field.Root>
      <div>
        <div className="mb-2 text-[12px] font-bold uppercase tracking-[.12em] text-dim">
          {t('admin.permissions')}
        </div>
        <PermPicker selected={perms} toggle={toggle} />
        {error ? <p className="mt-3 text-[13px] text-danger">{error}</p> : null}
      </div>
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
    </Dialog>
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
    <Dialog open title={t('nav.inviteUser')} onClose={close} width={460}>
      <div>
        <p className="mb-4 text-[13px] text-dim">{t('admin.inviteIntro')}</p>
        <PermPicker selected={perms} toggle={toggle} />
      </div>
      {link ? (
        <Callout.Root tone="accent" title={t('admin.inviteLink')}>
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
    </Dialog>
  );
});
