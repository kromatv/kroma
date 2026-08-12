// Shared building blocks for the account-creation forms. Both the in-app
// registration screen (`auth-forms.tsx`) and the public `/join` invite page
// render the exact same avatar tile + email/username/password inputs, so that
// block lives here once and is driven by controlled props.

import { useT } from '@kroma/ui';
import { Box, Field, Focusable, gradient, Icon, type StyleDecl, svFor, Text } from '@kroma/ui/kit';
import { useEffect, useRef, useState } from 'react';
import { Image } from '#web/shared/ui';
import { avatarGradient, initials } from '#web/shared/ui/user-avatar';

export type RegisterValues = Readonly<{ email: string; username: string; password: string }>;

const TILE = 112;

// The caption only shows while the tile is under a pointer or holds focus, so
// the initials read unobstructed the rest of the time.
const avatarPicker = svFor<{ root: StyleDecl; caption: StyleDecl }>()({
  slots: {
    root: { w: TILE, h: TILE, radius: 'lg', overflow: 'hidden' },
    caption: {
      absolute: true,
      left: 0,
      right: 0,
      bottom: 0,
      py: 4,
      bg: 'black/55',
      opacity: 0,
      _hover: { opacity: 1 },
      _focus: { opacity: 1 },
    },
  },
});

/** Avatar picker tile + the three registration inputs, controlled by the parent
 * form. The object-URL preview and hidden file input are managed internally; the
 * chosen File is reported through `onAvatar`. */
export function RegisterFields({
  values,
  onChange,
  onAvatar,
}: Readonly<{
  values: RegisterValues;
  onChange: (values: RegisterValues) => void;
  onAvatar: (avatar: File | null) => void;
}>) {
  const t = useT();
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { email, username, password } = values;

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pickFile(f: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    onAvatar(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  return (
    <>
      <Focusable
        sv={avatarPicker}
        label={t('auth.chooseAvatar')}
        onPress={() => fileRef.current?.click()}
      >
        {({ slots }) => (
          <>
            {preview ? (
              <Image src={preview} fit="cover" fill />
            ) : (
              <Box fill center style={gradient(avatarGradient(username || email || 'new'))}>
                {username.trim() ? (
                  <Text variant="h1" font="display" color="white/85">
                    {initials(username)}
                  </Text>
                ) : (
                  <Icon name="plus" size={34} thickness={1.6} color="white/85" />
                )}
              </Box>
            )}
            <Box style={slots.caption}>
              <Text variant="overline" color="white" textAlign="center">
                {t('common.photo')}
              </Text>
            </Box>
          </>
        )}
      </Focusable>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
      />

      {/* `md` against the app's `sm` default, matching the sign-in form these
          sit beside; see the note in auth-forms.tsx. */}
      <Field.Root w="100%" size="md" label={t('auth.email')} hideLabel>
        <Field.Input
          type="email"
          icon="mail"
          placeholder={t('auth.email')}
          value={email}
          onValueChange={(v) => onChange({ ...values, email: v })}
        />
      </Field.Root>
      <Field.Root w="100%" size="md" label={t('auth.username')} hideLabel>
        <Field.Input
          icon="user"
          placeholder={t('auth.username')}
          value={username}
          onValueChange={(v) => onChange({ ...values, username: v })}
          autoComplete="username"
        />
      </Field.Root>
      <Field.Root w="100%" size="md" label={t('auth.passwordHint')} hideLabel>
        <Field.Input
          type="password"
          icon="lock"
          placeholder={t('auth.passwordHint')}
          value={password}
          onValueChange={(v) => onChange({ ...values, password: v })}
          autoComplete="new-password"
        />
      </Field.Root>
    </>
  );
}
