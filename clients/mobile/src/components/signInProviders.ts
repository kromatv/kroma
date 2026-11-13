import { apiErrorText } from '@kromatv/client';
import type { KromaClient } from '@kromatv/client';
import {
  DEFAULT_SIGN_IN_METHODS,
  type SignInButton,
  type SignInMethods,
} from '@kromatv/client/accounts';
import type { FlowKeys } from '@kromatv/client/sso';
import { type FlowEnd, flowMessage } from '@kromatv/core';
import type { Translate } from '@kromatv/i18n';
import { useEffect, useState } from 'react';
import { makeClient } from '#mobile/lib/device';
import { authFor } from '#mobile/lib/providerSignIn';
import type { AuthSession } from '#mobile/lib/session';

export interface ProviderGateDeps {
  session: Pick<AuthSession, 'serverUrl' | 'adopt' | 'requestLocale'>;
  clientFor: (url: string) => KromaClient;
  t: Translate;
  serverName: string;
  enterApp(): void;
  setBusy(busy: string | null): void;
  setError(error: string | null): void;
}

/** The provider half of the sign-in screen: which ways in the current server
 * offers, what pressing a provider's button does, and what a flow that ended
 * without a session leaves behind. */
export function useProviderGate(deps: ProviderGateDeps) {
  const { session, clientFor, t, serverName, enterApp, setBusy, setError } = deps;
  const serverUrl = session.serverUrl;
  const [methods, setMethods] = useState<SignInMethods>(DEFAULT_SIGN_IN_METHODS);
  const [notice, setNotice] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<FlowKeys | null>(null);

  useEffect(() => {
    if (!serverUrl) return;
    let cancelled = false;
    clientFor(serverUrl)
      .accounts.config()
      .then(
        (config) => {
          if (!cancelled) setMethods(config.signIn ?? DEFAULT_SIGN_IN_METHODS);
        },
        () => undefined,
      );
    return () => {
      cancelled = true;
    };
  }, [serverUrl, clientFor]);

  const settle = (end: FlowEnd | null, provider: string) => {
    if (!end || !serverUrl) return;
    if (end.result.status === 'signedIn') {
      session.adopt(serverUrl, end.result);
      enterApp();
      return;
    }
    const message = flowMessage(end.result);
    const said = t(`sso.${message}.body`, { provider, server: serverName });
    const left =
      end.result.status === 'requested' ||
      end.result.status === 'emailTaken' ||
      end.result.status === 'invitationOnly';
    setWaiting(left ? end.keys : null);
    if (left) setNotice(said);
    else setError(said);
  };

  const press = async (provider: SignInButton) => {
    if (!serverUrl) return;
    setBusy('provider');
    setError(null);
    setNotice(null);
    try {
      const end = await authFor(serverUrl, clientFor(serverUrl)).signIn.with(provider.id);
      settle(end, provider.label);
    } catch (e) {
      setError(apiErrorText(e, t('auth.providerFailed', { provider: provider.label })));
    } finally {
      setBusy(null);
    }
  };

  /** Signs in with a password and, when a provider flow left an identity
   * waiting, links that identity to the account that just signed in. A link
   * that fails does not undo the sign-in. */
  const loginAndClaim = async (identifier: string, password: string) => {
    if (!serverUrl) throw new Error('no server');
    const signedIn = makeClient(serverUrl, session.requestLocale());
    const result = await signedIn.accounts.login(identifier, password);
    if (waiting) {
      signedIn.setAuthToken(result.token);
      await signedIn.sso.claim(waiting).catch(() => undefined);
      setWaiting(null);
    }
    session.adopt(serverUrl, result);
  };

  return { methods, notice, press, loginAndClaim };
}
