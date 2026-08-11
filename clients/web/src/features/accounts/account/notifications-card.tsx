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
import {
  Box,
  Button,
  Callout,
  Icon,
  ListRow,
  Row,
  Skeleton,
  Surface,
  Switch,
  Text,
} from '@kroma/ui/kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { kromaClient } from '#web/shared/lib/api';
import { pushBlocker, webPush } from '#web/shared/lib/push';
import { userQueries } from '#web/shared/lib/queries';

// The two channel columns must line up with the switches under them, and a
// switch is one shell step wide.
const CHANNEL_COLUMN = 46;

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
    <Surface elevated pad="none" p={22} radius="lg" border="border" gap={12}>
      <Box row align="flex-start" between gap={16}>
        <Box minW={0}>
          <Row gap={8}>
            <Icon name={subscribed ? 'bell' : 'bell-off'} size={16} />
            <Text variant="label">{t('push.title')}</Text>
          </Row>
          <Text variant="meta" color="textMuted" mt={4}>
            {t('push.description')}
          </Text>
        </Box>
        {blocker ? null : (
          <Button
            variant={subscribed ? 'ghost' : 'primary'}
            size="sm"
            label={subscribed ? t('push.disable') : t('push.enable')}
            onPress={toggle}
            loading={busy}
          />
        )}
      </Box>

      {blocker ? <Callout.Root size="sm" title={t(PUSH_BLOCKER_LABEL[blocker])} /> : null}
      {error ? (
        <Text variant="meta" color="danger">
          {error}
        </Text>
      ) : null}

      {subscribed && !blocker ? (
        <Row gap={12}>
          <Button
            variant="ghost"
            size="sm"
            label={t('push.sendTest')}
            onPress={sendTest}
            loading={busy}
          />
          {tested !== null ? (
            <Text variant="meta" color="textMuted">
              {tested > 0 ? t('push.testSent') : t('push.testFailed')}
            </Text>
          ) : null}
        </Row>
      ) : null}
    </Surface>
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
      <Surface elevated pad="none" p={22} radius="lg" border="border">
        <Skeleton h={128} radius="sm" />
      </Surface>
    );
  }

  return (
    <ListRow.Group size="md">
      <ListRow.Root label={t('notifications.settings')}>
        <ListRow.Trailing>
          <ChannelHead label={t('notifications.channelInApp')} />
          <ChannelHead label={t('notifications.channelPush')} />
        </ListRow.Trailing>
      </ListRow.Root>
      {data.categories.map((pref) => {
        const name = t(NOTIFICATION_CATEGORY_LABEL[pref.category]);
        return (
          <ListRow.Root key={pref.category} label={name}>
            <ListRow.Trailing>
              <Switch
                label={`${name} · ${t('notifications.channelInApp')}`}
                checked={pref.inApp}
                disabled={saving === pref.category}
                onChange={(inApp) => update(pref.category, { inApp })}
              />
              <Switch
                label={`${name} · ${t('notifications.channelPush')}`}
                checked={pref.push}
                disabled={saving === pref.category}
                onChange={(push) => update(pref.category, { push })}
              />
            </ListRow.Trailing>
          </ListRow.Root>
        );
      })}
    </ListRow.Group>
  );
}

function ChannelHead({ label }: Readonly<{ label: string }>) {
  return (
    <Box w={CHANNEL_COLUMN} align="center">
      <Text variant="overline" color="textDim" textAlign="center">
        {label}
      </Text>
    </Box>
  );
}
