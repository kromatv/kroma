import { useWebRuntime } from '#web/shared/lib/web-runtime';
// The push opt-in for this device, plus the per-account delivery matrix.

import { disablePush, enablePush } from '@kromatv/client/notifications';
import { blockerOf, PUSH_BLOCKER_LABEL } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Box, Button, Callout, Icon, Row, Surface, Text } from '@kromatv/ui/kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useSyncExternalStore } from 'react';

import { pushBlocker, webPush } from '#web/shared/lib/push';
import { DeliveryLog } from '#web/shared/ui/delivery-log';
import { NotificationMatrix } from '#web/features/accounts/account/notification-matrix';

const subscribeNever = () => () => {};

export function NotificationsCard() {
  return (
    <>
      <PushPanel />
      <NotificationMatrix />
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
