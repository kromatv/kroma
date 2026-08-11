import { hasPermission, type Invite, PERMISSIONS, type Permission } from '@kroma/core';
import { useLocale, useT } from '@kroma/ui';
import {
  Badge,
  Box,
  Button,
  ChoiceList,
  confirm,
  Divider,
  EmptyState,
  Field,
  IconWell,
  InputGroup,
  PageHeader,
  Row,
  Section,
  SegmentedControl,
  Surface,
  Txt,
} from '@kroma/ui/kit';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '#web/shared/lib/auth';
import { PAGE_MAIN } from '#web/shared/ui';

const EXPIRY_DAYS = ['1', '7', '30'] as const;
type ExpiryDays = (typeof EXPIRY_DAYS)[number];

const DAY_MS = 86_400_000;
const COPIED_MS = 1500;

function joinUrl(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/join?invite=${token}`;
}

function useCopied(): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      /* clipboard unavailable (insecure context) or blocked */
    }
  }, []);
  return [copied, copy];
}

export function InvitePage() {
  const t = useT();
  const { user, client } = useAuth();
  const allowed = user ? hasPermission(user, 'users.manage') : false;
  const [picked, setPicked] = useState<Permission[]>(['playback']);
  const [expiry, setExpiry] = useState<ExpiryDays>('7');
  const [created, setCreated] = useState<{ link: string; expiresAt: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Invite[] | null>(null);

  const refresh = useCallback(() => {
    if (!allowed) return;
    client
      .invites()
      .then(setPending)
      .catch(() => undefined);
  }, [allowed, client]);
  useEffect(refresh, [refresh]);

  if (!allowed) {
    return (
      <main className={PAGE_MAIN}>
        <EmptyState icon="lock" title={t('admin.noUsersPermission')} />
      </main>
    );
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await client.createInvite({
        permissions: picked,
        expiresInDays: Number(expiry),
      });
      setCreated({ link: res.url ?? joinUrl(res.token), expiresAt: res.expiresAt });
      refresh();
    } catch (e) {
      setCreated(null);
      setError(e instanceof Error ? e.message : t('error.serverBody'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={PAGE_MAIN}>
      <PageHeader title={t('nav.inviteUser')} subtitle={t('admin.inviteIntro')} />

      <div className="mt-6">
        <Surface elevated pad="none" radius={16} px={22} py={20} gap={18} minW={0}>
          <Box gap={10}>
            <Txt variant="label">{t('admin.permissions')}</Txt>
            <ChoiceList.Root
              mode="multiple"
              label={t('admin.permissions')}
              value={picked}
              onValueChange={(next) => setPicked(next as Permission[])}
            >
              {PERMISSIONS.map((p) => (
                <ChoiceList.Item
                  key={p.key}
                  value={p.key}
                  label={t(p.labelKey)}
                  hint={t(p.hintKey)}
                />
              ))}
            </ChoiceList.Root>
          </Box>

          <Divider />

          <Field label={t('admin.inviteExpiry')} hint={t('admin.inviteExpiryHint')}>
            <SegmentedControl.Root
              label={t('admin.inviteExpiry')}
              value={expiry}
              onValueChange={setExpiry}
              options={EXPIRY_DAYS.map((days) => ({
                value: days,
                label: t('admin.inviteExpiryDays', { count: Number(days) }),
              }))}
            />
          </Field>

          <Row gap={12} align="center" wrap>
            <Button
              icon="link"
              label={busy ? t('common.creating') : t('admin.createInviteLink')}
              loading={busy}
              disabled={picked.length === 0}
              onPress={() => void create()}
            />
            {error ? (
              <Txt variant="meta" color="danger">
                {error}
              </Txt>
            ) : null}
          </Row>
          {created ? (
            <>
              <Divider />
              <Box gap={14}>
                <Txt variant="label">{t('admin.inviteLink')}</Txt>
                <CreatedLink link={created.link} expiresAt={created.expiresAt} />
              </Box>
            </>
          ) : null}
        </Surface>
      </div>

      {pending ? (
        <Section title={t('admin.pendingInvites')} mt={28}>
          {pending.length === 0 ? (
            <EmptyState
              icon="mail"
              title={t('admin.invitesEmpty')}
              hint={t('admin.invitesEmptyHint')}
            />
          ) : (
            pending.map((inv) => <PendingInviteRow key={inv.token} inv={inv} onChange={refresh} />)
          )}
        </Section>
      ) : null}
    </main>
  );
}

function CreatedLink({ link, expiresAt }: Readonly<{ link: string; expiresAt: number }>) {
  const t = useT();
  const locale = useLocale();
  const [copied, copy] = useCopied();
  return (
    <>
      <InputGroup.Root label={t('admin.inviteLink')}>
        <InputGroup.Input value={link} readOnly selectOnFocus />
        <InputGroup.Addon align="inline-end">
          <InputGroup.IconButton
            icon={copied ? 'check' : 'copy'}
            label={copied ? t('common.copied') : t('common.copy')}
            onPress={() => void copy(link)}
          />
        </InputGroup.Addon>
      </InputGroup.Root>
      <Row gap={10} align="center" wrap>
        <Badge tone="success">
          {t('admin.expiresOn', { date: new Date(expiresAt * 1000).toLocaleDateString(locale) })}
        </Badge>
      </Row>
      <Txt variant="meta" color="textDim">
        {t('admin.inviteShareHint')}
      </Txt>
    </>
  );
}

function PendingInviteRow({ inv, onChange }: Readonly<{ inv: Invite; onChange: () => void }>) {
  const t = useT();
  const locale = useLocale();
  const { client } = useAuth();
  const [copied, copy] = useCopied();
  const [revoking, setRevoking] = useState(false);

  const daysLeft = Math.max(0, Math.ceil((inv.expiresAt * 1000 - Date.now()) / DAY_MS));
  const labels = PERMISSIONS.filter((p) => inv.permissions.includes(p.key)).map((p) =>
    t(p.labelKey),
  );
  const expiresOn = t('admin.expiresOn', {
    date: new Date(inv.expiresAt * 1000).toLocaleDateString(locale),
  });

  async function revoke() {
    const ok = await confirm({
      title: t('admin.revoke'),
      message: t('admin.confirmRevokeInvite'),
      confirmLabel: t('admin.revoke'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    setRevoking(true);
    try {
      await client.revokeInvite(inv.token);
      onChange();
    } finally {
      setRevoking(false);
    }
  }

  return (
    <Surface elevated pad="none" radius={16} px={18} py={14}>
      <Row gap={14} align="center" wrap>
        <IconWell name="mail" size="sm" />
        <Box flex minW={180} gap={2}>
          <Txt variant="label" lines={1}>
            {labels.join(' · ') || t('admin.permPlayback')}
          </Txt>
          <Txt variant="meta" color="textDim" lines={1}>
            {inv.createdBy
              ? `${expiresOn} · ${t('admin.inviteBy', { name: inv.createdBy })}`
              : expiresOn}
          </Txt>
        </Box>
        <Badge tone={daysLeft <= 1 ? 'warning' : 'neutral'}>
          {t('admin.inviteDaysLeft', { count: daysLeft })}
        </Badge>
        <Row gap={8} align="center">
          <Button
            variant="glass"
            size="sm"
            icon={copied ? 'check' : 'copy'}
            label={copied ? t('common.linkCopied') : t('common.copy')}
            onPress={() => void copy(joinUrl(inv.token))}
          />
          <Button
            variant="danger"
            size="sm"
            label={t('admin.revoke')}
            loading={revoking}
            onPress={() => void revoke()}
          />
        </Row>
      </Row>
    </Surface>
  );
}
