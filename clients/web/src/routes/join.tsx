import { apiErrorText } from '@kromatv/client';
import {
  DEFAULT_SIGN_IN_METHODS,
  InviteToken,
  type SignInButton,
  type SignInMethods,
} from '@kromatv/client/accounts';
import { useT } from '@kromatv/ui';
import { Box, Button, classes, styles, Text, useStyles } from '@kromatv/ui/kit';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { RegisterFields, type RegisterValues } from '#web/features/accounts/auth-fields';
import { Spinner } from '#web/features/accounts/auth-gate';
import { ProviderButtons } from '#web/features/accounts/provider-buttons';
import { PublicScreen } from '#web/features/accounts/public-screen';
import { useAuth } from '#web/shared/lib/auth';
import { useProviderFlow } from '#web/shared/lib/use-provider-flow';

// Public invitation acceptance page. An admin (with `users.manage`) shares
// `/join?invite=TOKEN`; the invitee creates their account here. The global
// AuthGate is bypassed on this path so a not-yet-user can reach it.
export const Route = createFileRoute('/join')({
  validateSearch: (s: Record<string, unknown>): { invite?: InviteToken } => {
    const invite = InviteToken.safeParse(s.invite);
    return invite.success ? { invite: invite.data } : {};
  },
  component: JoinPage,
});

function JoinPage() {
  const s = useStyles(sDefinition);

  const t = useT();
  const { invite } = Route.useSearch();
  const { client, register } = useAuth();
  const navigate = useNavigate();

  const [checkedStatus, setCheckedStatus] = useState<'checking' | 'invalid' | 'ok'>('checking');
  const status = invite ? checkedStatus : 'invalid';
  const [values, setValues] = useState<RegisterValues>({ email: '', username: '', password: '' });
  const [avatar, setAvatar] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [methods, setMethods] = useState<SignInMethods>(DEFAULT_SIGN_IN_METHODS);
  const startFlow = useProviderFlow();
  const { email, username, password } = values;

  useEffect(() => {
    let cancelled = false;
    client.accounts.config().then(
      (config) => {
        if (!cancelled && config.signIn) setMethods(config.signIn);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [client]);

  async function joinWith(provider: SignInButton) {
    if (!invite) return;
    setBusy(true);
    setError(null);
    try {
      await startFlow('signIn', provider.id, { returnTo: '/', invite });
    } catch (e) {
      setError(apiErrorText(e, t('auth.providerFailed', { provider: provider.label })));
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!invite) return;
    let cancelled = false;
    client.accounts
      .checkInvite(invite)
      .then((r) => {
        if (!cancelled) setCheckedStatus(r.valid ? 'ok' : 'invalid');
      })
      .catch(() => {
        if (!cancelled) setCheckedStatus('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [client, invite]);

  const valid = email.includes('@') && username.trim().length > 0 && password.length >= 4;

  async function submit() {
    if (!valid || !invite) return;
    setBusy(true);
    setError(null);
    try {
      await register(email.trim(), username.trim(), password, avatar, invite);
      // register() signs us in and invalidates the router, so a plain navigation
      // home lands in the (now authenticated) app shell no full reload needed.
      void navigate({ to: '/' });
    } catch (e) {
      let msg = t('auth.registerFailed');
      if (e instanceof Error && /403|invalid|expir/i.test(e.message)) msg = t('auth.inviteInvalid');
      else if (e instanceof Error && /409|déjà|exist/i.test(e.message)) msg = t('auth.emailTaken');
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublicScreen>
      {status === 'checking' ? <Spinner /> : null}
      {status === 'invalid' ? (
        <Box>
          <Text variant="heading" accessibilityRole="header" textAlign="center" mb={8}>
            {t('auth.inviteInvalidTitle')}
          </Text>
          <Text variant="body" color="textMuted" textAlign="center">
            {t('auth.inviteInvalidDesc')}
          </Text>
        </Box>
      ) : null}
      {status === 'ok' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className={classes(s.form)}
        >
          <Text variant="heading" accessibilityRole="header">
            {t('auth.joinKroma')}
          </Text>

          {methods.password ? (
            <RegisterFields values={values} onChange={setValues} onAvatar={setAvatar} />
          ) : (
            <Text variant="body" color="textMuted" textAlign="center">
              {t('auth.joinProviderOnly')}
            </Text>
          )}

          {error ? (
            <Text variant="meta" color="danger">
              {error}
            </Text>
          ) : null}

          <JoinActions
            methods={methods}
            busy={busy}
            valid={valid}
            onCreate={() => void submit()}
            onProvider={(provider) => void joinWith(provider)}
          />
        </form>
      ) : null}
    </PublicScreen>
  );
}

function JoinActions({
  methods,
  busy,
  valid,
  onCreate,
  onProvider,
}: Readonly<{
  methods: SignInMethods;
  busy: boolean;
  valid: boolean;
  onCreate: () => void;
  onProvider: (provider: SignInButton) => void;
}>) {
  const t = useT();
  return (
    <>
      {methods.password ? (
        <Button
          block
          size="md"
          label={busy ? t('auth.creating') : t('auth.createMyAccount')}
          onPress={onCreate}
          loading={busy}
          disabled={!valid}
        />
      ) : null}
      {methods.password && methods.providers.length > 0 ? (
        <Text variant="meta" color="textMuted" textAlign="center">
          {t('auth.joinWithProvider')}
        </Text>
      ) : null}
      <ProviderButtons
        providers={methods.providers}
        primary={!methods.password}
        disabled={busy}
        onPick={onProvider}
      />
    </>
  );
}

const sDefinition = styles({
  form: {
    display: 'flex',
    width: '100%',
    maxWidth: 380,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
  },
});
