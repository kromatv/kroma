import { hasPermission, type Invite, PERMISSIONS, type Permission } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Button, EmptyState, Txt } from '@kroma/ui/kit';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useAuth } from '#web/shared/lib/auth';
import { PAGE_MAIN, PAGE_SUBTITLE, PAGE_TITLE } from '#web/shared/ui';

/** The kit sm-button label metrics, tinted danger for the destructive action. */
const DANGER_LABEL = { fontSize: 13, fontWeight: '600' } as const;

// Admin page to invite users. Gated by the `users.manage` permission the only
// way (besides the bootstrap owner) to create accounts is via these invites.
export const Route = createFileRoute('/_app/invite')({
  component: InvitePage,
});

function joinUrl(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/join?invite=${token}`;
}

function InvitePage() {
  const t = useT();
  const { user, client } = useAuth();
  const [selected, setSelected] = useState<Set<Permission>>(new Set<Permission>(['playback']));
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Invite[]>([]);

  const allowed = user ? hasPermission(user, 'users.manage') : false;

  const refresh = () => {
    if (!allowed) return;
    client
      .invites()
      .then(setPending)
      .catch(() => undefined);
  };
  useEffect(refresh, [allowed, client]);

  if (!allowed) {
    return (
      <main className={PAGE_MAIN}>
        <EmptyState icon="lock" title={t('admin.noUsersPermission')} />
      </main>
    );
  }

  function toggle(p: Permission) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  async function create() {
    setBusy(true);
    setCopied(false);
    try {
      const res = await client.createInvite({ permissions: [...selected] });
      setLink(joinUrl(res.token));
      refresh();
    } catch {
      setLink(null);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      /* clipboard blocked the field is selectable */
    }
  }

  return (
    <main className={PAGE_MAIN}>
      <h1 className={PAGE_TITLE}>{t('nav.inviteUser')}</h1>
      <p className={PAGE_SUBTITLE}>{t('admin.inviteIntro')}</p>

      <div className="mt-6 rounded-2xl border border-border bg-surface-1 p-6">
        <div className="mb-4 text-[12px] font-bold uppercase tracking-[.12em] text-dim">
          {t('admin.permissions')}
        </div>
        <div className="flex flex-col gap-2.5">
          {PERMISSIONS.map((p) => (
            <label
              key={p.key}
              aria-label={t(p.labelKey)}
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/3"
            >
              <input
                type="checkbox"
                checked={selected.has(p.key)}
                onChange={() => toggle(p.key)}
                className="h-4 w-4 accent-(--kroma-accent)"
              />
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-text">{t(p.labelKey)}</span>
                <span className="block text-[12px] text-dim">{t(p.hintKey)}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="mt-5 flex">
          <Button
            label={busy ? t('common.creating') : t('admin.createInviteLink')}
            onPress={() => void create()}
            loading={busy}
            disabled={selected.size === 0}
          />
        </div>

        {link ? (
          <div className="mt-5 rounded-xl border border-accent/40 bg-accent-soft p-4">
            <div className="mb-2 text-[12px] font-bold uppercase tracking-[.12em] text-accent">
              {t('admin.inviteLink')}
            </div>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-lg border border-border-strong bg-surface-2 px-3 py-2.5 text-[13px] text-text"
              />
              <Button
                variant="glass"
                size="sm"
                label={copied ? t('common.copied') : t('common.copy')}
                onPress={() => void copy()}
              />
            </div>
          </div>
        ) : null}
      </div>

      {pending.length > 0 ? (
        <div className="mt-8">
          <div className="mb-3 text-[12px] font-bold uppercase tracking-[.12em] text-dim">
            {t('admin.pendingInvites')}
          </div>
          <div className="flex flex-col gap-2">
            {pending.map((inv) => (
              <div
                key={inv.token}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface-1 px-4 py-3"
              >
                <code className="truncate text-[13px] text-muted">{inv.token.slice(0, 12)}…</code>
                <span className="text-[12px] text-dim">{inv.permissions.join(', ')}</span>
                <div className="ml-auto shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => void client.revokeInvite(inv.token).then(refresh)}
                  >
                    <Txt color="danger" style={DANGER_LABEL}>
                      {t('admin.revoke')}
                    </Txt>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </main>
  );
}
