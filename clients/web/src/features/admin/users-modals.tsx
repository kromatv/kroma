import type { Invite, Permission, ResetCreated, VerificationCreated } from '@kroma/client/accounts';
import type { AdminUser } from '@kroma/client/admin';
import { PERMISSIONS } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Box,
  Button,
  Callout,
  ChoiceList,
  confirm,
  Dialog,
  Field,
  Icon,
  InputGroup,
  ListRow,
  Row,
  styles,
  Text,
} from '@kroma/ui/kit';
import { useCallback, useState } from 'react';
import { createCallable } from 'react-call';
import { useAsyncAction } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';

const s = styles({
  dashed: { borderWidth: 1, borderColor: 'text/25', borderStyle: 'dashed' },
  code: { fontFamily: 'monospace', letterSpacing: 4 },
});

// `navigator.clipboard` is undefined outside a secure context, so on a
// plain-http LAN address this throws synchronously, not via rejection.
async function copyText(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

const LINK_KIND = {
  reset: {
    path: '/reset',
    manualKey: 'admin.resetManual',
    sentKey: 'admin.resetSent',
  },
  verify: {
    path: '/verify-email',
    manualKey: 'admin.verificationManual',
    sentKey: 'admin.verificationSent',
  },
} as const;

/** A minted link (reset or verification) with its copy button and the delivery
 * outcome: sent by email, or manual when no delivery is configured. A reset's
 * HAND-COPY link embeds the code (the owner holds both halves anyway, and their
 * channel is the trusted one) so the user only picks a new password; the emailed
 * link never carries it. When the server knows no public URL at all, the link
 * is composed from the browser's own origin — right for an owner browsing the
 * very server they admin. */
function LinkResult({
  kind,
  label,
  url,
  token,
  delivered,
  code,
}: Readonly<{
  kind: 'reset' | 'verify';
  label: string;
  url: string | null;
  token: string;
  delivered: string;
  code?: string;
}>) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const { path, manualKey, sentKey } = LINK_KIND[kind];
  const base =
    url ??
    (typeof window !== 'undefined' ? `${window.location.origin}${path}?token=${token}` : null);
  const shown =
    kind === 'reset' && delivered === 'manual' && base && code ? `${base}&code=${code}` : base;
  return (
    <Box gap={8}>
      {shown ? (
        <InputGroup.Root label={label}>
          <InputGroup.Input value={shown} autoFocus={false} />
          <InputGroup.Addon align="inline-end">
            <InputGroup.Button
              icon="copy"
              label={copied ? t('common.copied') : t('common.copy')}
              onPress={() => {
                void copyText(shown).then((ok) => {
                  if (!ok) return;
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            />
          </InputGroup.Addon>
        </InputGroup.Root>
      ) : null}
      <Text variant="meta" color="textMuted">
        {delivered === 'manual' ? t(manualKey) : t(sentKey)}
      </Text>
    </Box>
  );
}

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
      <ListRow.Label>{inv.permissions.join(', ') || t('permissions.playback')}</ListRow.Label>
      <ListRow.Hint>
        {t('admin.expiresOn', {
          date: new Date(inv.expiresAt * 1000).toLocaleDateString('fr-FR'),
        })}
      </ListRow.Hint>
      <ListRow.Leading>
        <Row center w={42} h={42} shrink={0} radius="circle" style={s.dashed}>
          <Icon name="mail" size={18} thickness={1.8} color="textDim" />
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
          onPress={() => void client.accounts.revokeInvite(inv.token).then(onChange)}
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
      onValueChange={(next) => {
        const moved = diff(selected, next);
        if (moved) toggle(moved);
      }}
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
function diff(before: Set<Permission>, after: string[]): Permission | null {
  const next = new Set(after);
  return PERMISSIONS.find((p) => next.has(p.key) !== before.has(p.key))?.key ?? null;
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

/** Edit a user (name + permissions, email verification, access recovery, with a
 * guarded delete). Resolves `true` when the user was saved or deleted (the
 * caller refreshes), `false` on dismiss. */
export const EditUserModal = createCallable<{ user: AdminUser }, boolean>(({ call, user }) => {
  const t = useT();
  const { client, user: me } = useAuth();
  const [name, setName] = useState(user.username);
  const [perms, toggle] = usePermissionSet(user.permissions);
  const { busy, error, run } = useAsyncAction();
  const isSelf = me?.id === user.id;
  const [reset, setReset] = useState<ResetCreated | null>(null);
  const [verification, setVerification] = useState<VerificationCreated | null>(null);
  const [pinCleared, setPinCleared] = useState(false);

  const save = () =>
    run(
      async () => {
        await client.admin.updateUser(user.id, { permissions: [...perms], username: name.trim() });
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
    run(
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
    run(
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
            <Text variant="heading" textAlign="center" style={s.code}>
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
      </Dialog.Footer>
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
      const res = await client.accounts.createInvite({ permissions: [...perms] });
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
      ) : null}
      <Dialog.Footer>
        {link ? (
          <Dialog.Actions onCancel={close} cancelLabel={t('common.close')} />
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
      </Dialog.Footer>
    </Dialog.Root>
  );
});
