// The "live" chip a realtime console page pins beside its title, written inside
// <PageHeader.Actions>.

import { useT } from '@kroma/ui';
import { Row, Text } from '@kroma/ui/kit';
import { PillDot } from '#web/features/admin/pill';

export function RealtimeBadge() {
  const t = useT();
  return (
    <Row shrink={0} gap={10} px={16} py={8} radius="pill" bg="surface1" border="border">
      <PillDot tone="accent" size={7} pulse />
      <Text variant="meta" color="textMuted">
        {t('admin.realtimeActivity')}
      </Text>
    </Row>
  );
}
