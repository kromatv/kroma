import { Box, Icon, Spinner, styles, Text } from '@kroma/ui/kit';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { Avatar } from '#mobile/components/Avatar';
import { type Note, ProfileNote } from '#mobile/components/profile/ProfileNote';
import { useT } from '#mobile/lib/i18n';
import { useClient, useSession } from '#mobile/lib/session';
import { spacing, type } from '#mobile/lib/theme';

export function ProfilePhoto() {
  const t = useT();
  const client = useClient();
  const { user, setUser } = useSession();
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarNote, setAvatarNote] = useState<Note>(null);

  const avatar = client.resolveArt(user?.avatarUrl);

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    setAvatarBusy(true);
    setAvatarNote(null);
    try {
      const blob = await (await fetch(asset.uri)).blob();
      const { avatarUrl } = await client.uploadAvatar(blob);
      if (user) setUser({ ...user, avatarUrl });
    } catch {
      setAvatarNote({ text: t('account.avatarFailed'), ok: false });
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <Box style={s.identity}>
      <Pressable
        onPress={() => void pickPhoto()}
        disabled={avatarBusy}
        accessibilityRole="button"
        accessibilityLabel={t('account.changePhoto')}
        style={({ pressed }) => [pressed && { opacity: 0.85 }]}
      >
        <Avatar uri={avatar} name={user?.username} size={104} />
        <Box style={s.editBadge}>
          {avatarBusy ? (
            <Spinner size={14} thickness={2} color="accentInk" />
          ) : (
            <Icon name="camera" size={14} thickness={2} color="accentInk" />
          )}
        </Box>
      </Pressable>
      <Text style={s.photoHint}>{t('account.photoHint')}</Text>
      <ProfileNote note={avatarNote} />
    </Box>
  );
}

const s = styles({
  identity: { align: 'center', gap: spacing.xs, mt: spacing.xs },
  editBadge: {
    absolute: true,
    right: -2,
    bottom: -2,
    center: true,
    w: 30,
    h: 30,
    bg: 'accent',
    radius: 15,
    border: 'bg',
    borderWidth: 3,
  },
  photoHint: { ...type.small, mt: 2, textAlign: 'center' },
});
