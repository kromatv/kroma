import { disablePush, enablePush } from '@kromatv/client/notifications';
import { blockerOf, PUSH_BLOCKER_LABEL } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Button, Callout, Switch, Text } from '@kromatv/ui/kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useSyncExternalStore } from 'react';
import { SettingCard } from '#web/features/accounts/account/setting-card.component';
import { pushBlocker, webPush } from '#web/shared/lib/push';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

const subscribeNever = () => () => {};

/** Whether this device receives pushes: one switch, what stops it when the
 * browser cannot, and a test once it is on. */
export function PushCard() {
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
      if (subscribed) {
        await disablePush(webPush, webRuntime.client);
      } else {
        await enablePush(webPush, webRuntime.client);
      }
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

  const testResult = tested !== null && tested > 0 ? t('push.testSent') : t('push.testFailed');

  return (
    <SettingCard
      icon={subscribed ? 'bell-ringing' : 'bell-off'}
      title={t('push.title')}
      description={t('push.description')}
      aside={
        blocker ? undefined : (
          <Switch
            checked={subscribed}
            disabled={busy}
            onCheckedChange={() => void toggle()}
            label={t('push.title')}
          />
        )
      }
      footer={
        subscribed && !blocker ? (
          <>
            <Text variant="meta" color="textMuted" flex minW={160}>
              {tested === null ? t('push.testHint') : testResult}
            </Text>
            <Button
              variant="glass"
              size="sm"
              icon="send"
              label={t('push.sendTest')}
              onPress={() => void sendTest()}
              loading={busy}
            />
          </>
        ) : undefined
      }
    >
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
    </SettingCard>
  );
}
