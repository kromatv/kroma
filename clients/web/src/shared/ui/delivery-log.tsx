// What became of the pushes a server sent, one row per attempt. The account
// settings show the reader's own devices and the admin console everyone's; the
// two differ only in whether a record names the account it belongs to.

import type { NotificationDelivery } from '@kromatv/client/notifications';
import { DELIVERY_STATUS_LABEL, DELIVERY_STATUS_TONE, sentenceCase } from '@kromatv/core';
import { useFormat, useLocale, useT } from '@kromatv/ui';
import { Badge, Box, EmptyState, ListRow, Row, Skeleton, Text } from '@kromatv/ui/kit';

interface DeliveryLogProps {
  deliveries: NotificationDelivery[];
  pending?: boolean;
}

export function DeliveryLog({ deliveries, pending = false }: Readonly<DeliveryLogProps>) {
  const t = useT();

  if (pending) return <Skeleton h={120} radius="sm" />;

  if (deliveries.length === 0) {
    return (
      <EmptyState.Root size="sm" layout="fill" icon="bell-off">
        <EmptyState.Title>{t('notifications.deliveriesEmpty')}</EmptyState.Title>
        <EmptyState.Hint>{t('notifications.deliveriesEmptyHint')}</EmptyState.Hint>
      </EmptyState.Root>
    );
  }

  return (
    <ListRow.Group size="md">
      {deliveries.map((delivery) => (
        <DeliveryRow key={delivery.id} delivery={delivery} />
      ))}
    </ListRow.Group>
  );
}

function DeliveryRow({ delivery }: Readonly<{ delivery: NotificationDelivery }>) {
  const t = useT();
  const format = useFormat();
  const locale = useLocale();
  const device = delivery.device || t('notifications.deliveryDevice');
  const who = delivery.account?.username;

  return (
    <ListRow.Root>
      <ListRow.Label>{who ? `${device} · ${who}` : device}</ListRow.Label>
      {delivery.error ? <ListRow.Hint lines={2}>{delivery.error}</ListRow.Hint> : null}
      <ListRow.Trailing>
        <Row gap={10} align="center">
          <Text variant="meta" color="textDim">
            {sentenceCase(format.elapsed(delivery.createdAt), locale)}
          </Text>
          <Box w={88} align="flex-end">
            <Badge tone={DELIVERY_STATUS_TONE[delivery.status]}>
              {t(DELIVERY_STATUS_LABEL[delivery.status])}
            </Badge>
          </Box>
        </Row>
      </ListRow.Trailing>
    </ListRow.Root>
  );
}
