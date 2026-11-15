import { sizedImageUrl } from '@kromatv/core';
import { useLocale, useT } from '@kromatv/ui';
import {
  Box,
  Button,
  IconButton,
  type StyleScope,
  sharedStyle,
  styles,
  Text,
  useStyleScope,
  useStyles,
} from '@kromatv/ui/kit';
import { useMemo, useRef } from 'react';
import { StatusText, useSave } from '#web/features/accounts/account/ui';
import { imageUrl } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';
import { avatarGradient, UserAvatar } from '#web/shared/ui/user-avatar';

const AVATAR = 104;
const COVER = 132;

const sDefinition = styles({
  cover: { height: COVER, opacity: 0.55 },
  photo: {
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    filter: 'blur(36px) saturate(1.4)',
    transform: 'scale(1.5)',
  },
  fade: { backgroundImage: 'linear-gradient(to bottom, transparent 30%, var(--kroma-bg))' },
  ring: { borderWidth: 4, borderColor: 'bg', bg: 'bg' },
});

const coverOf = (seed: string, photo: string | null, scope: StyleScope) => {
  const image = photo ? `url("${photo}")` : avatarGradient(seed);
  return sharedStyle(`account:cover:${image}`, { backgroundImage: image }, scope);
};

/** The account's identity at the top of its page: a band in the account's own
 * colours, the photo with the control that replaces it, who this is and since
 * when, and the way out. */
export function AccountHeader() {
  const t = useT();
  const locale = useLocale();
  const scope = useStyleScope();
  const s = useStyles(sDefinition);
  const { user, client, updateUser, logout } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const photo = useSave();

  const since = useMemo(() => {
    const joined = user ? new Date(user.createdAt) : null;
    if (!joined || Number.isNaN(joined.getTime())) return null;
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(joined);
  }, [user, locale]);

  if (!user) return null;

  const photoUrl = sizedImageUrl(imageUrl(user.avatarUrl), 160);

  const pick = (file: File | null) => {
    if (!file) return;
    photo.run(async () => {
      const { avatarUrl } = await client.accounts.uploadAvatar(file);
      updateUser({ avatarUrl });
    }, t('account.avatarFailed'));
  };

  return (
    <Box>
      <Box radius="xl" overflow="hidden">
        <Box style={[s.cover, photoUrl ? s.photo : null, coverOf(user.id, photoUrl, scope)]} />
        <Box fill style={s.fade} />
      </Box>
      <Box row wrap align="flex-end" gap={20} px={{ base: 4, md: 20 }} mt={-(AVATAR / 2)}>
        <Box shrink={0}>
          <Box radius="xl" style={s.ring}>
            <UserAvatar
              name={user.username}
              avatarUrl={user.avatarUrl}
              seed={user.id}
              size={AVATAR}
            />
          </Box>
          <Box absolute bottom={-6} right={-6}>
            <IconButton
              icon="camera"
              variant="glass"
              diameter={36}
              label={t('account.changePhoto')}
              disabled={photo.status === 'saving'}
              onPress={() => fileRef.current?.click()}
            />
          </Box>
        </Box>
        <Box flex minW={200} pb={4}>
          <Text variant="heading" lines={1}>
            {user.username}
          </Text>
          <Text variant="body" color="textMuted" lines={1} mt={2}>
            {user.email}
          </Text>
          {since ? (
            <Text variant="meta" color="textDim" mt={6}>
              {t('account.memberSince', { date: since })}
            </Text>
          ) : null}
          <StatusText
            status={photo.status === 'saved' ? 'idle' : photo.status}
            error={photo.error}
          />
        </Box>
        <Box pb={8}>
          <Button
            variant="glass"
            size="sm"
            icon="logout"
            label={t('auth.logout')}
            onPress={() => void logout()}
          />
        </Box>
      </Box>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />
    </Box>
  );
}
