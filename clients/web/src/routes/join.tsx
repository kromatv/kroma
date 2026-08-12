import { useT } from '@kroma/ui';
import { Box, Button, Logo, Text } from '@kroma/ui/kit';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { RegisterFields, type RegisterValues } from '#web/features/accounts/auth-fields';
import { Spinner } from '#web/features/accounts/auth-gate';
import { useAuth } from '#web/shared/lib/auth';
import { PAGE_RADIAL } from '#web/shared/ui';

// Public invitation acceptance page. An admin (with `users.manage`) shares
// `/join?invite=TOKEN`; the invitee creates their account here. The global
// AuthGate is bypassed on this path so a not-yet-user can reach it.
export const Route = createFileRoute('/join')({
  validateSearch: (s: Record<string, unknown>): { invite?: string } => ({
    invite: typeof s.invite === 'string' ? s.invite : undefined,
  }),
  component: JoinPage,
});

function JoinPage() {
  const t = useT();
  const { invite } = Route.useSearch();
  const { client, register } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState<'checking' | 'invalid' | 'ok'>('checking');
  const [values, setValues] = useState<RegisterValues>({ email: '', username: '', password: '' });
  const [avatar, setAvatar] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { email, username, password } = values;

  useEffect(() => {
    if (!invite) {
      setStatus('invalid');
      return;
    }
    let cancelled = false;
    client
      .checkInvite(invite)
      .then((r) => {
        if (!cancelled) setStatus(r.valid ? 'ok' : 'invalid');
      })
      .catch(() => {
        if (!cancelled) setStatus('invalid');
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
    <main style={{ ...SCREEN, background: PAGE_RADIAL }}>
      {/* Auto margins (not justify-center) so a form taller than a small phone
          viewport scrolls instead of clipping its top. */}
      <Box w="100%" align="center" m="auto">
        <Box mb={40}>
          <Logo size={24} />
        </Box>

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
            style={FORM}
          >
            <Text variant="heading" accessibilityRole="header">
              {t('auth.joinKroma')}
            </Text>

            <RegisterFields values={values} onChange={setValues} onAvatar={setAvatar} />

            {error ? (
              <Text variant="meta" color="danger">
                {error}
              </Text>
            ) : null}

            <Button
              block
              label={busy ? t('auth.creating') : t('auth.createMyAccount')}
              onPress={() => void submit()}
              loading={busy}
              disabled={!valid}
            />
          </form>
        ) : null}
      </Box>
    </main>
  );
}

const SCREEN = {
  position: 'fixed',
  inset: 0,
  zIndex: 100,
  display: 'flex',
  flexDirection: 'column',
  overflowY: 'auto',
  paddingInline: 24,
  paddingBlock: 48,
} as const;

const FORM = {
  display: 'flex',
  width: '100%',
  maxWidth: 380,
  flexDirection: 'column',
  alignItems: 'center',
  gap: 20,
} as const;
