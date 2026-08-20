import { Box, Focusable, Icon, type StyleDecl, svFor, Text } from '@kroma/ui/kit';
import { UserAvatar } from '#web/shared/ui/user-avatar';

const AVATAR = 146;
const AVATAR_RADIUS = 22;

// The amber edge the row's tiles take, drawn on the avatar rather than around
// the whole column: the caption below is part of the control, not part of the
// picture. Same shape <AddTile> beside them takes.
const profileTile = svFor<{ root: StyleDecl; well: StyleDecl; label: StyleDecl }>()({
  slots: {
    root: { align: 'center', gap: 14 },
    well: {
      radius: AVATAR_RADIUS,
      shadow: 'card',
      _hover: { ring: 'focus' },
      _focus: { ring: 'focus' },
    },
    label: { color: 'text/82', fontWeight: '500' },
  },
});

export function ProfileTile({
  username,
  avatarUrl,
  seed,
  locked,
  lockedLabel,
  onPress,
}: Readonly<{
  username: string;
  avatarUrl: string | null;
  seed: string;
  locked: boolean;
  lockedLabel: string;
  onPress: () => void;
}>) {
  return (
    <Focusable sv={profileTile} ring={false} focusScale={1.06} label={username} onPress={onPress}>
      {({ slots }) => (
        <>
          <Box style={slots.well}>
            <UserAvatar
              name={username}
              avatarUrl={avatarUrl}
              seed={seed}
              size={AVATAR}
              radius={AVATAR_RADIUS}
            />
            {locked ? (
              // Solid surface, never a translucent one: an alpha background
              // lets the avatar gradient bleed through and muddies the icon.
              <Box
                absolute
                right={8}
                bottom={8}
                center
                w={30}
                h={30}
                radius="circle"
                border="white/12"
                bg="surface2"
                shadow="card"
                accessibilityLabel={lockedLabel}
              >
                <Icon name="lock" size={15} thickness={2.2} color="accent" />
              </Box>
            ) : null}
          </Box>
          <Text variant="body" style={slots.label}>
            {username}
          </Text>
        </>
      )}
    </Focusable>
  );
}
