import type { Release } from '#site/lib/release';
import { Badge } from '#ui/components/atoms/badge';
import { Box } from '#ui/components/atoms/box';

export interface ChannelBadgeProps {
  channel: Release['channel'];
  current?: boolean;
}

export function ChannelBadge({ channel, current = false }: Readonly<ChannelBadgeProps>) {
  if (channel === 'stable' && !current) return null;
  return (
    <Box shrink={0}>
      <Badge tone={channel === 'nightly' ? 'warning' : 'success'}>{channel}</Badge>
    </Box>
  );
}
