import { useT } from '@kromatv/ui';
import { Text } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { NotificationMatrix } from '#web/features/accounts/account/notification-matrix';
import { PushCard } from '#web/features/accounts/account/push-card';
import { SettingCard } from '#web/features/accounts/account/setting-card';
import { useWebRuntime } from '#web/shared/lib/web-runtime';
import { DeliveryLog } from '#web/shared/ui/delivery-log';

export function NotificationsCard() {
  return (
    <>
      <PushCard />
      <NotificationMatrix />
      <DeliveriesCard />
    </>
  );
}

function DeliveriesCard() {
  const webRuntime = useWebRuntime();
  const t = useT();
  const { data, isPending } = useQuery(webRuntime.queries.userQueries.deliveries());
  const deliveries = data?.deliveries ?? [];
  const empty = !isPending && deliveries.length === 0;

  return (
    <SettingCard
      icon="history"
      title={t('notifications.deliveries')}
      description={t('notifications.deliveriesHint')}
    >
      {empty ? (
        <Text variant="meta" color="textDim">
          {t('notifications.deliveriesEmpty')}
        </Text>
      ) : (
        <DeliveryLog deliveries={deliveries} pending={isPending} />
      )}
    </SettingCard>
  );
}
