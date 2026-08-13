// The sign-in and registration forms used by the login gate. Split out of
// `AuthGate.tsx`, which owns the gate/routing + profile picker and composes
// these two screens.

import { isEmail, isPassword, isUsername, type PublicUser } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Button, Callout, Field, Text } from '@kroma/ui/kit';
import { type CSSProperties, useState } from 'react';
import { RegisterFields, type RegisterValues } from '#web/features/accounts/auth-fields';
import { UserAvatar } from '#web/shared/ui/user-avatar';

const FORM: CSSProperties = { width: '100%' };

const COLUMN = 380;

export function LoginForm({
  profile,
  busy,
  error,
  notice = null,
  canGoBack = true,
  canUsePasskey = false,
  onBack,
  onSubmit,
  onPasskey,
}: Readonly<{
  profile: PublicUser | null;
  busy: boolean;
  error: string | null;
  notice?: string | null;
  canGoBack?: boolean;
  canUsePasskey?: boolean;
  onBack: () => void;
  onSubmit: (identifier: string, password: string) => void;
  onPasskey?: () => void;
}>) {
  const t = useT();
  const [identifier, setIdentifier] = useState(profile?.username ?? '');
  const [password, setPassword] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (identifier.trim() && password) onSubmit(identifier.trim(), password);
      }}
      style={FORM}
    >
      <Box w="100%" maxW={COLUMN} mx="auto" align="center" gap={20}>
        {profile ? (
          <UserAvatar
            name={profile.username}
            avatarUrl={profile.avatarUrl}
            seed={profile.id}
            size={96}
          />
        ) : null}
        <Text variant="subheading" accessibilityRole="header">
          {profile ? profile.username : t('auth.signinTitle')}
        </Text>

        {notice ? (
          <Box w="100%">
            <Callout.Root tone="accent" size="md" icon="info-circle">
              <Callout.Title>{notice}</Callout.Title>
            </Callout.Root>
          </Box>
        ) : null}

        {/* `size="md"` against the app's `sm` default (see router.tsx): the gate
            is a full-screen front door rather than a console page, and <Button>
            is `md` whatever the entries are - left alone, the form would stack a
            40px field under a 50px button. */}
        {profile ? null : (
          <Field.Root
            w="100%"
            size="md"
            label={t('auth.emailOrUsername')}
            hideLabel // Deliberate: the sign-in field is what this screen is for.
          >
            <Field.Input
              lift
              icon="user"
              placeholder={t('auth.emailOrUsername')}
              value={identifier}
              onValueChange={setIdentifier}
              autoComplete="username"
              autoFocus
            />
          </Field.Root>
        )}
        <Field.Root
          w="100%"
          size="md"
          label={t('auth.password')}
          hideLabel // Deliberate: with a profile already picked, the password is the only thing left to type.
        >
          <Field.Input
            lift
            type="password"
            icon="lock"
            placeholder={t('auth.password')}
            value={password}
            onValueChange={setPassword}
            autoFocus={Boolean(profile)}
          />
        </Field.Root>

        {error ? (
          <Text variant="meta" color="danger">
            {error}
          </Text>
        ) : null}

        {/* Hidden native submit keeps Enter-to-submit working; the visible
            control is the kit Button, so it matches the passkey one below. */}
        <input type="submit" hidden />
        <Button
          block
          label={busy ? t('auth.loggingIn') : t('auth.login')}
          loading={busy}
          disabled={busy || !password}
          onPress={() => {
            if (identifier.trim() && password) onSubmit(identifier.trim(), password);
          }}
          style={{ marginTop: 4 }}
        />
        {canUsePasskey && onPasskey ? (
          <Button
            block
            variant="glass"
            icon="key"
            label={t('auth.passkeyLogin')}
            onPress={() => onPasskey()}
            disabled={busy}
          />
        ) : null}
        {canGoBack ? (
          <Button
            variant="ghost"
            size="sm"
            icon="chevron-left"
            label={t('common.back')}
            onPress={onBack}
          />
        ) : null}
      </Box>
    </form>
  );
}

export function RegisterForm({
  busy,
  error,
  canGoBack,
  onBack,
  onSubmit,
}: Readonly<{
  busy: boolean;
  error: string | null;
  canGoBack: boolean;
  onBack: () => void;
  onSubmit: (email: string, username: string, password: string, avatar: File | null) => void;
}>) {
  const t = useT();
  const [values, setValues] = useState<RegisterValues>({ email: '', username: '', password: '' });
  const [avatar, setAvatar] = useState<File | null>(null);
  const { email, username, password } = values;

  // Shared field rules (mirrors the server), so client + every app validate alike.
  const valid = isEmail(email) && isUsername(username) && isPassword(password);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(email.trim(), username.trim(), password, avatar);
      }}
      style={FORM}
    >
      <Box w="100%" maxW={COLUMN} mx="auto" align="center" gap={20}>
        <Text variant="subheading" accessibilityRole="header">
          {t('auth.newAccount')}
        </Text>

        <RegisterFields values={values} onChange={setValues} onAvatar={setAvatar} />

        {error ? (
          <Text variant="meta" color="danger">
            {error}
          </Text>
        ) : null}

        <Button
          block
          label={busy ? t('auth.creating') : t('auth.createAccount')}
          onPress={() => {
            if (valid) onSubmit(email.trim(), username.trim(), password, avatar);
          }}
          loading={busy}
          disabled={!valid}
        />
        {canGoBack ? (
          <Button
            variant="ghost"
            size="sm"
            icon="chevron-left"
            label={t('common.back')}
            onPress={onBack}
          />
        ) : null}
      </Box>
    </form>
  );
}
