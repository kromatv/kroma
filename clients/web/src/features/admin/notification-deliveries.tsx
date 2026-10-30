// The server's recent pushes, every account included: what was attempted, to
// which device, and why it did not arrive.

import { useT } from '@kromatv/ui';
import { Box, Surface, Text } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useWebRuntime } from '#web/shared/lib/web-runtime';
import { DeliveryLog } from '#web/shared/ui/delivery-log';

export function NotificationDeliveries() {
  const webRuntime = useWebRuntime();

  const t = useT();
  const { data, isPending } = useQuery({
    queryKey: ['admin', 'notifications', 'deliveries'],
    queryFn: () => webRuntime.client.admin.notifications.deliveries(),
    staleTime: 15_000,
  });

  return (
    <Surface elevated pad="none" p={22} radius="xl" border="border" gap={16}>
      <Box gap={4}>
        <Text variant="label">{t('admin.deliveriesTitle')}</Text>
        <Text variant="meta" color="textDim">
          {t('admin.deliveriesSub')}
        </Text>
      </Box>
      <DeliveryLog deliveries={data?.deliveries ?? []} pending={isPending} />
    </Surface>
  );
}
