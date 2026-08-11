// Presentation only; auth calls and phase switching stay in sign-in.

import { Box, Button, Field, OtpField, Spinner, styles, Text } from '@kroma/ui/kit';
import { useT } from '#mobile/lib/i18n';
import { spacing, type } from '#mobile/lib/theme';
import { Avatar } from './Avatar';
import { OnboardingBox, OnboardingTitle } from './OnboardingScreen';
import { ErrorBanner } from './ui';

export type Identity = { name: string; avatarUri: string | null };

function IdentityHeader({
  identity,
  subtitle,
}: Readonly<{ identity: Identity; subtitle?: string }>) {
  return (
    <Box style={s.identity}>
      <Avatar uri={identity.avatarUri} name={identity.name} size={72} />
      <Text style={s.name}>{identity.name}</Text>
      {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
    </Box>
  );
}

export function PinPhase({
  identity,
  pin,
  disabled,
  checking,
  error,
  onChange,
}: Readonly<{
  identity: Identity;
  pin: string;
  disabled: boolean;
  checking: boolean;
  error: string | null;
  onChange(next: string): void;
}>) {
  const t = useT();
  return (
    <OnboardingBox>
      <IdentityHeader identity={identity} subtitle={t('auth.pinRequired')} />
      {/* The column stretches its children (the phases below hand it
          full-width fields), so the code row has to size to its slots and
          centre itself under the avatar rather than sit against the margin. */}
      <OtpField.Root
        self="center"
        maxLength={4}
        value={pin}
        onValueChange={onChange}
        mask
        disabled={disabled}
        physicalKeyboard
        autoFocus
      />
      {checking ? (
        <Box self="center">
          <Spinner size={24} color="textMuted" />
        </Box>
      ) : null}
      <ErrorBanner message={error} />
    </OnboardingBox>
  );
}

export function CredentialsPhase({
  identity,
  serverLabel,
  identifier,
  password,
  busy,
  error,
  onIdentifier,
  onPassword,
  onSubmit,
}: Readonly<{
  identity: Identity | null;
  serverLabel: string | null;
  identifier: string;
  password: string;
  busy: boolean;
  error: string | null;
  onIdentifier(next: string): void;
  onPassword(next: string): void;
  onSubmit(): void;
}>) {
  const t = useT();
  return (
    <OnboardingBox>
      {identity ? (
        <IdentityHeader identity={identity} />
      ) : (
        <OnboardingTitle title={t('auth.signinTitle')} subtitle={serverLabel} />
      )}
      {identity ? null : (
        <Field.Root
          w="100%"
          label={t('auth.emailOrUsername')}
          hideLabel
          value={identifier}
          onValueChange={onIdentifier}
        >
          <Field.Input
            icon="user"
            placeholder={t('auth.emailOrUsername')}
            keyboardType="email-address"
            autoComplete="username"
            autoFocus
          />
        </Field.Root>
      )}
      <Field.Root
        w="100%"
        label={t('auth.password')}
        hideLabel
        value={password}
        onValueChange={onPassword}
      >
        <Field.Input
          icon="lock"
          placeholder={t('auth.password')}
          type="password"
          autoComplete="current-password"
          autoFocus={identity !== null}
          onSubmit={onSubmit}
        />
      </Field.Root>
      <ErrorBanner message={error} />
      <Button
        label={busy ? t('auth.loggingIn') : t('auth.login')}
        onPress={onSubmit}
        loading={busy}
        disabled={!password || (!identity && !identifier.trim())}
      />
    </OnboardingBox>
  );
}

const s = styles({
  identity: { align: 'center', gap: spacing.xs, mb: spacing.xs },
  name: { ...type.heading, mt: 6 },
  subtitle: { ...type.caption, mt: 4, textAlign: 'center' },
});
