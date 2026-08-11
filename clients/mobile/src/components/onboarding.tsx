// Onboarding building blocks shared by the sign-in and connect screens: the
// profile tile of the "Who's watching?" gate. Code and PIN entry is the kit's
// <OtpField>, and the trailing "add" tile its <AddTile>.

import { Box, Spinner, StatusDot, styles, Text } from '@kroma/ui/kit';
import { Pressable } from 'react-native';
import { type } from '#mobile/lib/theme';
import { Avatar } from './Avatar';

const TILE_AVATAR = 104;

export function ProfileTile({
  name,
  caption,
  avatarUri,
  busy,
  disabled,
  offline,
  locked,
  onPress,
}: Readonly<{
  name: string;
  caption?: string | null;
  avatarUri: string | null;
  busy?: boolean;
  disabled?: boolean;
  offline?: boolean;
  locked?: boolean;
  onPress(): void;
}>) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || offline}
      style={({ pressed }) => [s.tile, (pressed || offline) && { opacity: 0.6 }]}
    >
      <Box>
        <Avatar
          uri={avatarUri}
          name={name}
          size={TILE_AVATAR}
          circle={false}
          locked={locked && !busy}
        />
        {busy ? (
          <Box style={s.tileBusy}>
            <Spinner size={24} color="text" />
          </Box>
        ) : null}
      </Box>
      <Text lines={1} style={s.tileName}>
        {name}
      </Text>
      {caption ? (
        <Box style={s.captionRow}>
          <StatusDot online={!offline} size={7} />
          <Text lines={1} style={[s.tileCaption, offline && s.tileCaptionOffline]}>
            {caption}
          </Text>
        </Box>
      ) : null}
    </Pressable>
  );
}

const s = styles({
  tile: { align: 'center', gap: 6, w: 96 },
  tileBusy: {
    absolute: true,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    center: true,
    bg: 'bg/55',
    radius: Math.round(TILE_AVATAR * 0.16),
  },
  tileName: { ...type.caption, mt: 2, color: 'text', fontWeight: '600' },
  tileCaption: { ...type.small },
  tileCaptionOffline: { color: 'danger' },
  captionRow: { row: true, align: 'center', gap: 5, mt: -2 },
});
