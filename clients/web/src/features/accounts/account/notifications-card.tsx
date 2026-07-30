// The push opt-in for this device, plus the per-account delivery matrix.

import {
  blockerOf,
  type CategoryPref,
  disablePush,
  enablePush,
  NOTIFICATION_CATEGORY_LABEL,
  type NotificationCategory,
  PUSH_BLOCKER_LABEL,
  type PushBlocker,
} from '@kroma/core';
import { useT } from '@kroma/ui';
import { IconBell, IconBellOff } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Panel } from '#web/features/accounts/account/ui';
import { kromaClient } from '#web/shared/lib/api';
import { pushBlocker, webPush } from '#web/shared/lib/push';
import { userQueries } from '#web/shared/lib/queries';
import { Button } from '#web/shared/ui';

export function NotificationsCard() {
  return (
    <>
      <PushPanel />
      <CategoryMatrix />
    </>
  );
}

function PushPanel() {
  const t = useT();
  const qc = useQueryClient();
  const [blocker, setBlocker] = useState<PushBlocker | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tested, setTested] = useState<number | null>(null);

  // Reads `navigator`, so it cannot run in the prerendered shell's first render.
  useEffect(() => setBlocker(pushBlocker()), []);

  const { data } = useQuery(userQueries.pushKey());
  const subscribed = data?.subscribed ?? false;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    setTested(null);
    try {
      if (subscribed) await disablePush(webPush, kromaClient());
      else await enablePush(webPush, kromaClient());
      await qc.invalidateQueries({ queryKey: userQueries.pushKey().queryKey });
    } catch (e) {
      const reason = blockerOf(e);
      setError(reason ? t(PUSH_BLOCKER_LABEL[reason]) : t('push.failed'));
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      const { delivered } = await kromaClient().testPush();
      setTested(delivered);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="flex flex-col gap-3 p-5.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-text">
            {subscribed ? <IconBell size={16} /> : <IconBellOff size={16} />}
            {t('push.title')}
          </p>
          <p className="mt-1 text-[12.5px] leading-snug text-muted">{t('push.description')}</p>
        </div>
        {blocker ? null : (
          <Button
            variant={subscribed ? 'ghost' : 'primary'}
            size="sm"
            label={subscribed ? t('push.disable') : t('push.enable')}
            onPress={toggle}
            loading={busy}
          />
        )}
      </div>

      {blocker && (
        <p className="rounded-lg bg-white/4 px-3 py-2 text-[12.5px] text-muted">
          {t(PUSH_BLOCKER_LABEL[blocker])}
        </p>
      )}
      {error && <p className="text-[12.5px] text-red-300">{error}</p>}

      {subscribed && !blocker && (
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            label={t('push.sendTest')}
            onPress={sendTest}
            loading={busy}
          />
          {tested !== null && (
            <span className="text-[12.5px] text-muted">
              {tested > 0 ? t('push.testSent') : t('push.testFailed')}
            </span>
          )}
        </div>
      )}
    </Panel>
  );
}

function CategoryMatrix() {
  const t = useT();
  const qc = useQueryClient();
  const { data, isPending } = useQuery(userQueries.notificationPrefs());
  const [saving, setSaving] = useState<NotificationCategory | null>(null);

  const update = async (category: NotificationCategory, patch: Partial<CategoryPref>) => {
    if (!data) return;
    setSaving(category);
    try {
      const categories = data.categories.map((c) =>
        c.category === category ? { ...c, ...patch } : c,
      );
      const saved = await kromaClient().setNotificationPrefs({ categories });
      qc.setQueryData(userQueries.notificationPrefs().queryKey, saved);
    } finally {
      setSaving(null);
    }
  };

  if (isPending || !data) {
    return (
      <Panel className="p-5.5">
        <div className="h-32 animate-pulse rounded-lg bg-white/4" />
      </Panel>
    );
  }

  return (
    <Panel className="p-5.5">
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="text-[14px] font-semibold text-text">{t('notifications.settings')}</p>
        <div className="flex shrink-0 gap-4 text-[11px] font-semibold uppercase tracking-wide text-dim">
          <span className="w-10 text-center">{t('notifications.channelInApp')}</span>
          <span className="w-10 text-center">{t('notifications.channelPush')}</span>
        </div>
      </div>
      <div className="flex flex-col divide-y divide-border">
        {data.categories.map((pref) => (
          <div key={pref.category} className="flex items-center justify-between gap-4 py-2.5">
            <span className="min-w-0 truncate text-[13.5px] text-text">
              {t(NOTIFICATION_CATEGORY_LABEL[pref.category])}
            </span>
            <div className="flex shrink-0 gap-4">
              <Toggle
                checked={pref.inApp}
                busy={saving === pref.category}
                onChange={(inApp) => update(pref.category, { inApp })}
              />
              <Toggle
                checked={pref.push}
                busy={saving === pref.category}
                onChange={(push) => update(pref.category, { push })}
              />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Toggle({
  checked,
  busy,
  onChange,
}: Readonly<{ checked: boolean; busy: boolean; onChange: (next: boolean) => void }>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={busy}
      onClick={() => onChange(!checked)}
      className={`flex h-6 w-10 items-center rounded-full px-0.5 transition-colors disabled:opacity-50 ${
        checked ? 'bg-accent' : 'bg-white/12'
      }`}
    >
      <span
        className={`h-5 w-5 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
