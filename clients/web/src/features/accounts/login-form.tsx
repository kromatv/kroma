import {
  DEFAULT_SIGN_IN_METHODS,
  type PublicUser,
  type SignInButton,
  type SignInMethods,
} from '@kromatv/client/accounts';
import { useT } from '@kromatv/ui';
import { Box, Button, Callout, classes, Field, styles, Text, useStyles } from '@kromatv/ui/kit';
import { useState } from 'react';
import { ProviderButtons } from '#web/features/accounts/provider-buttons';
import { UserAvatar } from '#web/shared/ui/user-avatar';

const sDefinition = styles({ form: { width: '100%' }, nudge: { mt: 4 } });

const COLUMN = 380;

function LoginActions({
  typing,
  busy,
  canSubmit,
  providers,
  onSubmit,
  onProvider,
  onPasskey,
  onTypePassword,
  onForgot,
  onBack,
}: Readonly<{
  typing: boolean;
  busy: boolean;
  canSubmit: boolean;
  providers: readonly SignInButton[];
  onSubmit: () => void;
  onProvider?: (provider: SignInButton) => void;
  onPasskey?: () => void;
  onTypePassword: () => void;
  onForgot?: () => void;
  onBack?: () => void;
}>) {
  const s = useStyles(sDefinition);
  const t = useT();
  return (
    <>
      {typing ? (
        <Button
          block
          size="md"
          label={busy ? t('auth.loggingIn') : t('auth.login')}
          loading={busy}
          disabled={busy || !canSubmit}
          onPress={onSubmit}
          style={s.nudge}
        />
      ) : null}
      {onProvider ? (
        <ProviderButtons
          providers={providers}
          primary={!typing}
          disabled={busy}
          onPick={onProvider}
        />
      ) : null}
      {onPasskey ? (
        <Button
          block
          size="md"
          variant="glass"
          icon="key"
          label={t('auth.passkeyLogin')}
          onPress={() => onPasskey()}
          disabled={busy}
        />
      ) : null}
      {typing ? null : (
        <Button
          variant="ghost"
          size="sm"
          label={t('auth.usePassword')}
          onPress={onTypePassword}
          disabled={busy}
        />
      )}
      {onForgot && typing ? (
        <Button
          variant="ghost"
          size="sm"
          label={t('auth.forgotPassword')}
          onPress={onForgot}
          disabled={busy}
        />
      ) : null}
      {onBack ? (
        <Button
          variant="ghost"
          size="sm"
          icon="chevron-left"
          label={t('common.back')}
          onPress={onBack}
        />
      ) : null}
    </>
  );
}

export function LoginForm({
  profile,
  busy,
  error,
  notice = null,
  canGoBack = true,
  canUsePasskey = false,
  methods = DEFAULT_SIGN_IN_METHODS,
  onBack,
  onSubmit,
  onPasskey,
  onProvider,
  onForgot,
}: Readonly<{
  profile: PublicUser | null;
  busy: boolean;
  error: string | null;
  notice?: string | null;
  canGoBack?: boolean;
  canUsePasskey?: boolean;
  methods?: SignInMethods;
  onBack: () => void;
  onSubmit: (identifier: string, password: string) => void;
  onPasskey?: () => void;
  onProvider?: (provider: SignInButton) => void;
  onForgot?: (identifier: string) => void;
}>) {
  const s = useStyles(sDefinition);

  const t = useT();
  const [identifier, setIdentifier] = useState(profile?.username ?? '');
  const [password, setPassword] = useState('');
  const [typing, setTyping] = useState(methods.password);
  const submit = () => {
    if (identifier.trim() && password) onSubmit(identifier.trim(), password);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={classes(s.form)}
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

        {/* `size="md"` against the browser's `sm` default: the gate is a
            full-screen front door rather than a console page, and its fields and
            buttons step up together so they share one height and one corner. */}
        {profile || !typing ? null : (
          <Field.Root
            w="100%"
            size="md"
            label={t('auth.emailOrUsername')}
            hideLabel // Deliberate: the sign-in field is what this screen is for.
          >
            <Field.Input
              icon="user"
              placeholder={t('auth.emailOrUsername')}
              value={identifier}
              onValueChange={setIdentifier}
              autoComplete="username"
              autoFocus
            />
          </Field.Root>
        )}
        {typing ? (
          <Field.Root
            w="100%"
            size="md"
            label={t('auth.password')}
            hideLabel // Deliberate: with a profile already picked, the password is the only thing left to type.
          >
            <Field.Input
              type="password"
              icon="lock"
              placeholder={t('auth.password')}
              value={password}
              onValueChange={setPassword}
              autoFocus={Boolean(profile)}
            />
          </Field.Root>
        ) : null}
        {typing && !methods.password ? (
          <Text variant="meta" color="textMuted" textAlign="center">
            {t('auth.passwordOffHint')}
          </Text>
        ) : null}

        {error ? (
          <Text variant="meta" color="danger">
            {error}
          </Text>
        ) : null}

        {/* Hidden native submit keeps Enter-to-submit working; the visible
            control is the kit Button, so it matches the passkey one below. */}
        <input type="submit" hidden />
        <LoginActions
          typing={typing}
          busy={busy}
          canSubmit={Boolean(password)}
          providers={onProvider ? methods.providers : []}
          onSubmit={submit}
          onProvider={onProvider}
          onPasskey={methods.passkeys && canUsePasskey ? onPasskey : undefined}
          onTypePassword={() => setTyping(true)}
          onForgot={onForgot ? () => onForgot(identifier.trim()) : undefined}
          onBack={canGoBack ? onBack : undefined}
        />
      </Box>
    </form>
  );
}
