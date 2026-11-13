import {
  DEFAULT_SIGN_IN_METHODS,
  type PublicUser,
  type SignInButton,
  type SignInMethods,
} from '@kromatv/client/accounts';
import { type SignInPress, signInLayout } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Box, classes, styles, Text, useStyles } from '@kromatv/ui/kit';
import { useState } from 'react';
import {
  FormLinks,
  Notices,
  OrRule,
  PasswordFields,
  PressButtons,
} from '#web/features/accounts/login-methods';
import { UserAvatar } from '#web/shared/ui/user-avatar';

const sDefinition = styles({ form: { width: '100%' } });

const COLUMN = 380;

function Heading({
  profile,
  server,
}: Readonly<{ profile: PublicUser | null; server: string | null }>) {
  const t = useT();
  return (
    <Box align="center" gap={profile ? 16 : 6}>
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
      {server && !profile ? (
        <Text variant="body" color="textMuted" textAlign="center">
          {t('auth.signinOn', { server })}
        </Text>
      ) : null}
    </Box>
  );
}

/** The sign-in form. The ways in that take one press form one group and the
 * password form another, in the order the server lists them, and the group
 * that comes first carries the main action. A server with passwords off shows
 * no form, and a link opens it for an admin. */
export function LoginForm({
  profile,
  server = null,
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
  /** The server's own name, shown under the title when it has one. */
  server?: string | null;
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
  const [identifier, setIdentifier] = useState(profile?.username ?? '');
  const [password, setPassword] = useState('');
  const layout = signInLayout(methods, { passkey: canUsePasskey && Boolean(onPasskey) });
  const presses = layout.presses.filter((press) => press.kind === 'passkey' || onProvider);
  const [typing, setTyping] = useState(layout.password);
  const formLeads = layout.lead === 'password' || presses.length === 0;

  const submit = () => {
    if (identifier.trim() && password) onSubmit(identifier.trim(), password);
  };
  const press = (pressed: SignInPress) => {
    if (pressed.kind === 'passkey') onPasskey?.();
    else onProvider?.(pressed.provider);
  };

  const buttons =
    presses.length > 0 ? (
      <PressButtons presses={presses} primary={!formLeads} disabled={busy} onPress={press} />
    ) : null;
  const form = typing ? (
    <PasswordFields
      profile={profile}
      identifier={identifier}
      password={password}
      busy={busy}
      primary={formLeads}
      focused={formLeads || !layout.password}
      restricted={!layout.password}
      onIdentifier={setIdentifier}
      onPassword={setPassword}
      onSubmit={submit}
      onForgot={onForgot ? () => onForgot(identifier.trim()) : undefined}
    />
  ) : null;
  const [first, second] = formLeads ? [form, buttons] : [buttons, form];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={classes(s.form)}
    >
      <Box w="100%" maxW={COLUMN} mx="auto" align="center" gap={28}>
        <Heading profile={profile} server={server} />

        <Notices notice={notice} error={error} />

        <input type="submit" hidden />
        <Box w="100%" gap={20}>
          {first}
          {first && second ? <OrRule /> : null}
          {second}
        </Box>

        <FormLinks
          typing={typing}
          canGoBack={canGoBack}
          busy={busy}
          onType={() => setTyping(true)}
          onBack={onBack}
        />
      </Box>
    </form>
  );
}
