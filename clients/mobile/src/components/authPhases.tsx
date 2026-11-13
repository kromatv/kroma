// Presentation only; auth calls and phase switching stay in sign-in.

import {
  DEFAULT_SIGN_IN_METHODS,
  type SignInButton,
  type SignInMethods,
} from '@kromatv/client/accounts';
import { signInLayout } from '@kromatv/core';
import {
  Box,
  Button,
  Field,
  hasGlyph,
  OtpField,
  Spinner,
  styles,
  Text,
  useStyles,
} from '@kromatv/ui/kit';
import { useState } from 'react';
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
  const s = useStyles(sDefinition);

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

function PasswordFields({
  identity,
  identifier,
  password,
  busy,
  primary,
  focused,
  onIdentifier,
  onPassword,
  onSubmit,
}: Readonly<{
  identity: Identity | null;
  identifier: string;
  password: string;
  busy: boolean;
  primary: boolean;
  focused: boolean;
  onIdentifier(next: string): void;
  onPassword(next: string): void;
  onSubmit(): void;
}>) {
  const t = useT();
  return (
    <>
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
            autoFocus={focused}
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
          autoFocus={focused && identity !== null}
          onSubmit={onSubmit}
        />
      </Field.Root>
      <Button
        variant={primary ? 'primary' : 'glass'}
        label={busy ? t('auth.loggingIn') : t('auth.login')}
        onPress={onSubmit}
        loading={busy}
        disabled={!password || (!identity && !identifier.trim())}
      />
    </>
  );
}

function OrRule() {
  const s = useStyles(sDefinition);
  const t = useT();
  return (
    <Box style={s.rule}>
      <Box style={s.line} />
      <Text style={s.or}>{t('auth.or')}</Text>
      <Box style={s.line} />
    </Box>
  );
}

/** The sign-in form. The providers' buttons form one group and the password
 * fields another, in the order the server lists them, and the group that comes
 * first carries the main action. A server with passwords off shows a link that
 * opens the fields for an admin. Passkeys have no prompt on this app. */
export function CredentialsPhase({
  identity,
  serverLabel,
  identifier,
  password,
  busy,
  providerBusy = false,
  error,
  notice = null,
  methods = DEFAULT_SIGN_IN_METHODS,
  onIdentifier,
  onPassword,
  onSubmit,
  onProvider,
}: Readonly<{
  identity: Identity | null;
  serverLabel: string | null;
  identifier: string;
  password: string;
  busy: boolean;
  providerBusy?: boolean;
  error: string | null;
  notice?: string | null;
  methods?: SignInMethods;
  onIdentifier(next: string): void;
  onPassword(next: string): void;
  onSubmit(): void;
  onProvider?(provider: SignInButton): void;
}>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const layout = signInLayout(methods, { passkey: false });
  const providers = onProvider
    ? layout.presses.flatMap((press) => (press.kind === 'provider' ? [press.provider] : []))
    : [];
  const [opened, setOpened] = useState(false);
  const typing = layout.password || opened;
  const formLeads = layout.lead === 'password' || providers.length === 0;
  const buttons =
    providers.length > 0 ? (
      <Box style={s.group}>
        {providers.map((provider, index) => (
          <Button
            key={provider.id}
            variant={!formLeads && index === 0 ? 'primary' : 'glass'}
            icon={hasGlyph(provider.icon) ? provider.icon : 'key'}
            label={t('auth.continueWith', { provider: provider.label })}
            disabled={busy || providerBusy}
            loading={providerBusy}
            onPress={() => onProvider?.(provider)}
          />
        ))}
      </Box>
    ) : null;
  const fields = typing ? (
    <Box style={s.group}>
      <PasswordFields
        identity={identity}
        identifier={identifier}
        password={password}
        busy={busy}
        primary={formLeads}
        focused={formLeads || !layout.password}
        onIdentifier={onIdentifier}
        onPassword={onPassword}
        onSubmit={onSubmit}
      />
    </Box>
  ) : null;
  const [first, second] = formLeads ? [fields, buttons] : [buttons, fields];
  return (
    <OnboardingBox>
      {identity ? (
        <IdentityHeader identity={identity} />
      ) : (
        <OnboardingTitle title={t('auth.signinTitle')} subtitle={serverLabel} />
      )}
      {notice ? <Text style={s.notice}>{notice}</Text> : null}
      <ErrorBanner message={error} />
      {first}
      {first && second ? <OrRule /> : null}
      {second}
      {typing ? null : (
        <Button variant="ghost" label={t('auth.usePassword')} onPress={() => setOpened(true)} />
      )}
    </OnboardingBox>
  );
}

const sDefinition = styles({
  identity: { align: 'center', gap: spacing.xs, mb: spacing.xs },
  name: { ...type.heading, mt: 6 },
  subtitle: { ...type.caption, mt: 4, textAlign: 'center' },
  notice: { ...type.caption, textAlign: 'center' },
  group: { gap: spacing.sm },
  rule: { row: true, align: 'center', gap: spacing.sm },
  line: { flex: 1, h: 1, bg: 'border' },
  or: { ...type.caption, color: 'textDim' },
});
