import { Badge } from '@kroma/ui/kit/atoms/badge';
import { Box } from '@kroma/ui/kit/atoms/box';
import type { Release } from '#site/lib/release';

export interface ChannelBadgeProps {
  channel: Release['channel'];
  current?: boolean;
}

export function ChannelBadge({ channel, current = false }: Readonly<ChannelBadgeProps>) {
  if (channel === 'stable' && !current) return null;
  return (
    <Box shrink={0}>
      <Badge tone={channel === 'canary' ? 'warning' : 'success'}>{channel}</Badge>
    </Box>
  );
}
