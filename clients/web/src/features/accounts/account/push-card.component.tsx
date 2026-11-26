import { blockerOf, PUSH_BLOCKER_LABEL } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Button, Callout, Switch, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { useDevicePush } from '#web/features/accounts/account/use-device-push.hook';
import { SettingCard } from '#web/shared/ui/setting-card.component';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

/** Whether this device receives pushes: one switch, what stops it when the
 * browser cannot, and a test once it is on. */
export function PushCard() {
  const webRuntime = useWebRuntime();
  const t = useT();
  const { blocker, subscribed, setSubscribed } = useDevicePush();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tested, setTested] = useState<number | null>(null);

  const toggle = async () => {
    setBusy(true);
    setError(null);
    setTested(null);
    try {
      await setSubscribed(!subscribed);
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
