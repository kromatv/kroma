import type { PerfFlag } from '@kromatv/client/performance';
import { useT } from '@kromatv/ui';
import { Badge, Row } from '@kromatv/ui/kit';
import { flagLook } from '#web/features/admin/performance-format';

function FlagBadge({ flag }: Readonly<{ flag: PerfFlag }>) {
  const t = useT();
  const { label, tone } = flagLook(flag, t);
  return <Badge tone={tone}>{label}</Badge>;
}

/** The problems a row shows by its numbers alone. */
export function PerfFlags({ flags }: Readonly<{ flags: readonly PerfFlag[] }>) {
  return (
    <Row wrap gap={4}>
      {flags.map((flag) => (
        <FlagBadge key={flag} flag={flag} />
      ))}
    </Row>
  );
}
