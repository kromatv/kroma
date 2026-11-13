import { apiErrorText } from '@kromatv/client';
import {
  type AuthConfig,
  DEFAULT_SIGN_IN_METHODS,
  type SignInMethods,
} from '@kromatv/client/accounts';
import type { FlowKeys, FlowResult } from '@kromatv/client/sso';
import { useT } from '@kromatv/ui';
import { Box, Button, Text } from '@kromatv/ui/kit';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { LoginForm } from '#web/features/accounts/login-form';
import { Spinner } from '#web/features/accounts/auth-gate';
import { PublicScreen } from '#web/features/accounts/public-screen';
import { type SsoMessage, ssoMessage } from '#web/features/accounts/sso-message';
import { useAuth } from '#web/shared/lib/auth';
import { safeRedirect } from '#web/shared/lib/safe-redirect';
import { forgetFlow, leaveOutcome, pendingFlow } from '#web/shared/lib/sso-flow';
import { passkeysSupported } from '#web/shared/lib/webauthn';
import { RouteLink } from '#web/shared/ui/route-link';

type Waiting = Extract<FlowResult, { status: 'requested' | 'emailTaken' | 'invitationOnly' }>;

type View =
  | { kind: 'collecting' }
  | { kind: 'message'; message: SsoMessage; reason?: string }
  | { kind: 'waiting'; status: Waiting['status']; keys: FlowKeys };

const COLUMN = 380;

/** Where a provider sends a person back to. Collects the flow this tab began
 * with the code the address carries, then signs in, hands the result to the
 * page that asked for it, or says why nobody was signed in. */
export function SsoReturn({ flow, code }: Readonly<{ flow?: string; code?: string }>) {
  const t = useT();
  const { client, enter, login, loginPasskey } = useAuth();
  const navigate = useNavigate();
  const began = useRef(false);
  const [pending] = useState(() => (flow && code ? pendingFlow(flow) : null));
  const [view, setView] = useState<View>(
    pending ? { kind: 'collecting' } : { kind: 'message', message: 'elsewhere' },
  );
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (began.current || !pending || !code) return;
    began.current = true;
    const keys = { flowId: pending.flowId, secret: pending.secret, code };
    client.accounts.config().then(
      (loaded) => {
        setConfig(loaded);
        setProvider(loaded.signIn?.providers.find((p) => p.id === pending.provider)?.label ?? null);
      },
      () => undefined,
    );
    client.sso.finish(keys).then(
      (result) => {
        if (pending.purpose !== 'signIn') {
          forgetFlow();
          leaveOutcome({ purpose: pending.purpose, provider: pending.provider, result });
          void navigate({ to: safeRedirect(pending.returnTo) ?? '/', replace: true });
          return;
        }
        if (result.status === 'signedIn') {
          forgetFlow();
          enter(result);
          void navigate({ to: safeRedirect(pending.returnTo) ?? '/', replace: true });
          return;
        }
        if (
          result.status === 'requested' ||
          result.status === 'emailTaken' ||
          result.status === 'invitationOnly'
        ) {
          setView({ kind: 'waiting', status: result.status, keys });
          return;
        }
        forgetFlow();
        setView({
          kind: 'message',
          message: ssoMessage(result),
          reason: result.status === 'failed' ? result.reason : undefined,
        });
      },
      () => {
        forgetFlow();
        setView({ kind: 'message', message: 'expired' });
      },
    );
  }, [client, code, enter, navigate, pending]);

  const words = {
    provider: provider ?? t('sso.yourProvider'),
    server: config?.serverName ?? 'KROMA',
  };
  const methods: SignInMethods = config?.signIn ?? DEFAULT_SIGN_IN_METHODS;

  async function claimAfter(signIn: () => Promise<void>, keys: FlowKeys) {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (e) {
      setError(apiErrorText(e, t('auth.loginFailed')));
      setBusy(false);
      return;
    }
    try {
      await client.sso.claim(keys);
      forgetFlow();
      void navigate({ to: '/', replace: true });
    } catch (e) {
      forgetFlow();
      setClaiming(false);
      setView({ kind: 'message', message: 'claimFailed' });
      setError(apiErrorText(e, t('sso.claimFailed.body', words)));
    } finally {
      setBusy(false);
    }
  }

  if (view.kind === 'collecting') {
    return (
      <PublicScreen>
        <Spinner />
        <Text variant="body" color="textMuted" mt={20}>
          {t('sso.collecting')}
        </Text>
      </PublicScreen>
    );
  }

  if (view.kind === 'waiting' && claiming) {
    const keys = view.keys;
    return (
      <PublicScreen>
        <Box w="100%" maxW={COLUMN} align="center" gap={20}>
          <Text variant="body" color="textMuted" textAlign="center">
            {t('sso.claimHint', words)}
          </Text>
          <LoginForm
            profile={null}
            busy={busy}
            error={error}
            canGoBack
            canUsePasskey={passkeysSupported()}
            methods={{ ...methods, password: true }}
            onBack={() => {
              setError(null);
              setClaiming(false);
            }}
            onSubmit={(identifier, password) =>
              void claimAfter(() => login(identifier, password), keys)
            }
            onPasskey={() => void claimAfter(loginPasskey, keys)}
          />
        </Box>
      </PublicScreen>
    );
  }

  const message: SsoMessage = view.kind === 'waiting' ? view.status : view.message;
  const signedInAnyway = message === 'claimFailed';
  return (
    <PublicScreen>
      <Box w="100%" maxW={COLUMN} align="center" gap={16}>
        <Text variant="heading" accessibilityRole="header" textAlign="center">
          {t(`sso.${message}.title`, words)}
        </Text>
        <Text variant="body" color="textMuted" textAlign="center">
          {signedInAnyway && error ? error : t(`sso.${message}.body`, words)}
        </Text>
        {view.kind === 'message' && view.reason ? (
          <Text variant="meta" color="textMuted" textAlign="center">
            {t('sso.reference', { reason: view.reason })}
          </Text>
        ) : null}
        {view.kind === 'waiting' ? (
          <Button
            block
            size="md"
            variant="glass"
            icon="link"
            label={t('sso.haveAccount')}
            onPress={() => setClaiming(true)}
          />
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          label={signedInAnyway ? t('sso.continue') : t('sso.backToSignIn')}
          asChild
        >
          <RouteLink to={signedInAnyway ? '/' : '/login'} replace />
        </Button>
      </Box>
    </PublicScreen>
  );
}
