import { useWebRuntime } from '#web/shared/lib/web-runtime';
// The push opt-in for this device, plus the per-account delivery matrix.

import {
  type CategoryPref,
  disablePush,
  enablePush,
  type NotificationCategory,
} from '@kromatv/client/notifications';
import { blockerOf, NOTIFICATION_CATEGORY_LABEL, PUSH_BLOCKER_LABEL } from '@kromatv/core';
import { useT } from '@kromatv/ui';
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
} from '@kromatv/ui/kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useSyncExternalStore } from 'react';

import { pushBlocker, webPush } from '#web/shared/lib/push';
import { DeliveryLog } from '#web/shared/ui/delivery-log';

// The two channel columns must line up with the switches under them, and a
// switch is one shell step wide.
const subscribeNever = () => () => {};

const CHANNEL_COLUMN = 46;

export function NotificationsCard() {
  return (
    <>
      <PushPanel />
      <CategoryMatrix />
      <DeliveriesPanel />
    </>
  );
}

function DeliveriesPanel() {
  const webRuntime = useWebRuntime();

  const t = useT();
  const { data, isPending } = useQuery(webRuntime.queries.userQueries.deliveries());

  return (
    <Surface elevated pad="none" p={22} radius="xl" border="border" gap={16}>
      <Box gap={4}>
        <Text variant="label">{t('notifications.deliveries')}</Text>
        <Text variant="meta" color="textDim">
          {t('notifications.deliveriesHint')}
        </Text>
      </Box>
      <DeliveryLog deliveries={data?.deliveries ?? []} pending={isPending} />
    </Surface>
  );
}

function PushPanel() {
  const webRuntime = useWebRuntime();

  const t = useT();
  const qc = useQueryClient();
  const blocker = useSyncExternalStore(subscribeNever, pushBlocker, () => null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tested, setTested] = useState<number | null>(null);

  const { data } = useQuery(webRuntime.queries.userQueries.pushKey());
  const subscribed = data?.subscribed ?? false;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    setTested(null);
    try {
      if (subscribed) await disablePush(webPush, webRuntime.client);
      else await enablePush(webPush, webRuntime.client);
      await qc.invalidateQueries({ queryKey: webRuntime.queries.userQueries.pushKey().queryKey });
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
      const { delivered } = await webRuntime.client.notifications.push.test();
      setTested(delivered);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Surface elevated pad="none" p={22} radius="xl" border="border" gap={12}>
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

      {blocker ? (
        <Callout.Root size="sm">
          <Callout.Title>{t(PUSH_BLOCKER_LABEL[blocker])}</Callout.Title>
        </Callout.Root>
      ) : null}
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
  const webRuntime = useWebRuntime();

  const t = useT();
  const qc = useQueryClient();
  const { data, isPending } = useQuery(webRuntime.queries.userQueries.notificationPrefs());
  const [saving, setSaving] = useState<NotificationCategory | null>(null);

  const update = async (category: NotificationCategory, patch: Partial<CategoryPref>) => {
    if (!data) return;
    setSaving(category);
    try {
      const categories = data.categories.map((c) =>
        c.category === category ? { ...c, ...patch } : c,
      );
      const saved = await webRuntime.client.notifications.setPrefs({ categories });
      qc.setQueryData(webRuntime.queries.userQueries.notificationPrefs().queryKey, saved);
    } finally {
      setSaving(null);
    }
  };

  if (isPending || !data) {
    return (
      <Surface elevated pad="none" p={22} radius="xl" border="border">
        <Skeleton h={128} radius="sm" />
      </Surface>
    );
  }

  return (
    <ListRow.Group size="md">
      <ListRow.Root>
        <ListRow.Label>{t('notifications.settings')}</ListRow.Label>
        <ListRow.Trailing>
          <ChannelHead label={t('notifications.channelInApp')} />
          <ChannelHead label={t('notifications.channelPush')} />
        </ListRow.Trailing>
      </ListRow.Root>
      {data.categories.map((pref) => {
        const name = t(NOTIFICATION_CATEGORY_LABEL[pref.category]);
        return (
          <ListRow.Root key={pref.category}>
            <ListRow.Label>{name}</ListRow.Label>
            <ListRow.Trailing>
              <Switch
                label={`${name} · ${t('notifications.channelInApp')}`}
                checked={pref.inApp}
                disabled={saving === pref.category}
                onCheckedChange={(inApp) => update(pref.category, { inApp })}
              />
              <Switch
                label={`${name} · ${t('notifications.channelPush')}`}
                checked={pref.push}
                disabled={saving === pref.category}
                onCheckedChange={(push) => update(pref.category, { push })}
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
