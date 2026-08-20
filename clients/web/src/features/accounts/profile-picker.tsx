import type { StoredSession } from '@kroma/core';
import { useT } from '@kroma/ui';
import { AddTile, Box, Focusable, type StyleDecl, styles, svFor, Text } from '@kroma/ui/kit';
import { ProfileTile } from '#web/features/accounts/profile-tile';

const forgetLink = svFor<{ root: StyleDecl; label: StyleDecl }>()({
  slots: {
    root: {},
    label: { color: 'textDim', _hover: { color: 'text' }, _focus: { color: 'text' } },
  },
});

const s = styles({
  tiles: { columnGap: 28, rowGap: 36, alignContent: 'flex-start' },
});

export interface ProfileChoice {
  id: string;
  username: string;
  avatarUrl: string | null;
  remembered: StoredSession | null;
  locked: boolean;
}

export function ProfilePicker({
  tiles,
  error,
  onPick,
  onForget,
  onAdd,
}: Readonly<{
  tiles: ProfileChoice[];
  error: string | null;
  onPick: (tile: ProfileChoice) => void;
  onForget: (userId: string) => void;
  onAdd: () => void;
}>) {
  const t = useT();
  return (
    <Box w="100%" maxW={896} align="center">
      <Text variant="h1" accessibilityRole="header" textAlign="center">
        {t('auth.whoWatching')}
      </Text>
      <Text variant="body" color="textMuted" textAlign="center" maxW={576} mt={12} mb={48}>
        {t('auth.whoWatchingHint')}
      </Text>

      <Box
        row
        wrap
        w="100%"
        maxW={1100}
        align="flex-start"
        justify="center"
        px={24}
        py={16}
        style={s.tiles}
      >
        {tiles.map((p) => (
          <Box key={p.id} w={150} align="center" gap={12}>
            <ProfileTile
              username={p.username}
              avatarUrl={p.avatarUrl}
              seed={p.id}
              locked={p.locked}
              lockedLabel={t('auth.passwordRequired')}
              onPress={() => onPick(p)}
            />
            {p.remembered ? (
              <Focusable
                sv={forgetLink}
                ring={false}
                label={t('auth.logout')}
                onPress={() => onForget(p.id)}
              >
                {({ slots }) => (
                  <Text variant="meta" style={slots.label}>
                    {t('auth.logout')}
                  </Text>
                )}
              </Focusable>
            ) : null}
          </Box>
        ))}

        <Box w={150} align="center">
          <AddTile label={t('auth.addProfile')} onPress={onAdd} />
        </Box>
      </Box>

      {error ? (
        <Text variant="meta" color="danger" mt={32}>
          {error}
        </Text>
      ) : null}
    </Box>
  );
}
