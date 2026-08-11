// Photo section: the account avatar with an upload control. Picking a file
// uploads immediately through the avatar endpoint and mirrors the resulting URL
// into the auth session so the sidebar/picker update at once. (The server has no
// avatar-removal endpoint, so there is no reset here.)

import { useT } from '@kroma/ui';
import { Box, Button, Icon, Row, Surface, Text } from '@kroma/ui/kit';
import { useRef } from 'react';
import { StatusText, useSave } from '#web/features/accounts/account/ui';
import { useAuth } from '#web/shared/lib/auth';
import { UserAvatar } from '#web/shared/ui/user-avatar';

export function PhotoCard() {
  const t = useT();
  const { user, client, updateUser } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const avatar = useSave();

  if (!user) return null;

  const pickAvatar = (file: File | null) => {
    if (!file) return;
    avatar.run(async () => {
      const { avatarUrl } = await client.uploadAvatar(file);
      updateUser({ avatarUrl });
    }, t('account.avatarFailed'));
  };

  return (
    <Surface
      elevated
      pad="none"
      p={22}
      radius="lg"
      border="border"
      row
      wrap
      align="center"
      gap={24}
    >
      <Box shrink={0}>
        <UserAvatar
          name={user.username}
          avatarUrl={user.avatarUrl}
          seed={user.id}
          size={96}
          radius={22}
        />
        <Box
          absolute
          bottom={-4}
          right={-4}
          center
          w={32}
          h={32}
          radius="circle"
          border="borderStrong"
          bg="surface2"
        >
          <Icon name="camera" size={15} stroke={1.9} color="accent" />
        </Box>
      </Box>

      <Box flex minW={{ base: '100%', md: 240 }}>
        <Text variant="meta" color="textMuted" mb={12}>
          {t('account.photoHint')}
        </Text>
        <Row gap={12}>
          <Button
            variant="glass"
            size="sm"
            label={avatar.status === 'saving' ? t('common.saving') : t('account.changePhoto')}
            onPress={() => fileRef.current?.click()}
            loading={avatar.status === 'saving'}
          />
          <StatusText status={avatar.status} error={avatar.error} />
        </Row>
      </Box>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => pickAvatar(e.target.files?.[0] ?? null)}
      />
    </Surface>
  );
}
