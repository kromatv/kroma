import type { NotificationChannel } from '@kromatv/core';
import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, Button, type IconName, styles, useStyles } from '@kromatv/ui/kit';

/** How many of the kinds a toggle speaks for a channel reaches. */
export interface ChannelReach {
  on: number;
  of: number;
}

export const CHANNELS: readonly NotificationChannel[] = ['inApp', 'push'];

const CHANNEL: Record<NotificationChannel, { label: MessageKey; on: IconName; off: IconName }> = {
  inApp: { label: 'notifications.channelInApp', on: 'bell', off: 'bell-off' },
  push: { label: 'notifications.channelPush', on: 'device-mobile', off: 'device-mobile-off' },
};

const sDefinition = styles({
  some: { backgroundColor: 'transparent', borderStyle: 'dashed' },
});

/** The two ways one row's notifications arrive, each a toggle that names its
 * channel. A toggle is filled when the channel reaches everything the row
 * speaks for, outlined when it reaches only some of it, and quiet when it
 * reaches none; pressing it turns the channel on for all, or off once it is. */
export function ChannelToggles({
  name,
  reach,
  disabled,
  onSwitch,
}: Readonly<{
  name: string;
  reach: (channel: NotificationChannel) => ChannelReach;
  disabled: boolean;
  onSwitch: (channel: NotificationChannel, on: boolean) => void;
}>) {
  const s = useStyles(sDefinition);
  const t = useT();
  return (
    <Box row gap={8} role="group" aria-label={name}>
      {CHANNELS.map((channel) => {
        const { on, of } = reach(channel);
        const all = on === of;
        return (
          <Button
            key={channel}
            variant="outline"
            size="sm"
            icon={on > 0 ? CHANNEL[channel].on : CHANNEL[channel].off}
            label={t(CHANNEL[channel].label)}
            active={on > 0}
            pressed={all}
            disabled={disabled}
            onPress={() => onSwitch(channel, !all)}
            style={on > 0 && !all ? s.some : undefined}
          />
        );
      })}
    </Box>
  );
}
