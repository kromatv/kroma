import { apiErrorText, KromaApiError } from '@kromatv/client';
import {
  type AuthConfig,
  DEFAULT_SIGN_IN_METHODS,
  type PublicUser,
  type SignInButton,
  type StoredSession,
} from '@kromatv/client/accounts';
import { dropKidsProfileAsk, kidsDoor } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { useEffect, useState } from 'react';
import { ForgotForm, RegisterForm } from '#web/features/accounts/auth-forms.component';
import { LoginForm } from '#web/features/accounts/login-form.component';
import { pickerTiles } from '#web/features/accounts/picker-tiles';
import { PinEntry } from '#web/features/accounts/pin-entry.component';
import { ProfilePicker } from '#web/features/accounts/profile-picker.component';
import { useAuth } from '#web/shared/lib/auth';
import { useProfilePick } from '#web/features/accounts/use-profile-pick.hook';
import { safeRedirect } from '#web/shared/lib/safe-redirect';
import { useAuthFlows } from '#web/shared/lib/use-auth-flows.hook';
import { passkeysSupported } from '#web/shared/lib/webauthn';

type Mode =
  | { kind: 'pick' }
  | { kind: 'login'; user: PublicUser | null; expired?: boolean }
  | { kind: 'register' }
  | { kind: 'forgot'; identifier: string }
  | { kind: 'pin'; account: StoredSession };

function pathToReturnTo(): string {
  const { pathname, search } = window.location;
  const asked = new URLSearchParams(search).get('redirect');
  return safeRedirect(pathname === '/login' ? asked : `${pathname}${search}`) ?? '/';
}

function entryMode(config: AuthConfig, accounts: readonly StoredSession[]): Mode {
  if (!config.hasAccounts) {
    return { kind: 'register' };
  }
  if (config.publicUserList || accounts.length > 0) {
    return { kind: 'pick' };
  }
  return { kind: 'login', user: null };
}

export function GateBody({ config }: Readonly<{ config: AuthConfig }>) {
  const t = useT();
  const { client, accounts, login, loginPasskey, register, activate, forget } = useAuth();
  const [profiles, setProfiles] = useState<PublicUser[]>([]);
  const [mode, setMode] = useState<Mode>(() => entryMode(config, accounts));
  const [entryAccounts, setEntryAccounts] = useState(accounts);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotSent, setForgotSent] = useState(false);
  const canPick = config.publicUserList;
  const methods = config.signIn ?? DEFAULT_SIGN_IN_METHODS;
  const flows = useAuthFlows();
  const listsProfiles = config.hasAccounts && config.publicUserList;
  const { kids, pick, addKids } = useProfilePick(setMode);
  const backToPick = () => {
    setError(null);
    dropKidsProfileAsk();
    setMode({ kind: 'pick' });
  };

  if (entryAccounts !== accounts) {
    setEntryAccounts(accounts);
    if (!listsProfiles) {
      setMode(entryMode(config, accounts));
    }
  }

  useEffect(() => {
    if (!listsProfiles) {
      return undefined;
    }
    let cancelled = false;
    client.accounts.users().then(
      (users) => {
        if (!cancelled) {
          setProfiles(users);
        }
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [client, listsProfiles]);

  function fail(e: unknown, fallback: string) {
    setError(
      e instanceof Error && /401|invalid|identifiants/i.test(e.message)
        ? t('auth.invalidCredentials')
        : fallback,
    );
  }

  async function doLogin(identifier: string, password: string) {
    setBusy(true);
    setError(null);
    try {
      await login(identifier, password);
    } catch (e) {
      // 429 → brute-force lockout: surface the server's localized cooldown text.
      if (e instanceof KromaApiError && e.status === 429) {
        setError(apiErrorText(e, t('auth.loginLocked')));
      } else {
        fail(e, t('auth.loginFailed'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function doPasskeyLogin() {
    setBusy(true);
    setError(null);
    try {
      await loginPasskey();
    } catch (e) {
      // A user dismissing the browser prompt (DOMException) isn't a real error.
      if (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'AbortError')) {
        return;
      }
      console.error('passkey sign-in failed', e);
      fail(e, t('auth.passkeyLoginFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function doProvider(provider: SignInButton) {
    setBusy(true);
    setError(null);
    try {
      await flows.signIn.with(provider.id, { returnTo: pathToReturnTo() });
    } catch (e) {
      setError(apiErrorText(e, t('auth.providerFailed', { provider: provider.label })));
    } finally {
      setBusy(false);
    }
  }

  async function doRegister(
    email: string,
    username: string,
    password: string,
    avatar: File | null,
  ) {
    setBusy(true);
    setError(null);
    try {
      await register(email, username, password, avatar);
    } catch (e) {
      setError(
        e instanceof Error && /409|déjà|exist/i.test(e.message)
          ? t('auth.emailTaken')
          : t('auth.registerFailed'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function doForgot(identifier: string) {
    setBusy(true);
    try {
      await client.accounts.requestReset(identifier);
    } catch {
      // Swallowed on purpose: the confirmation is uniform whether the request
      // reached the server or not, so this screen never answers "does this
      // account exist?".
    } finally {
      setBusy(false);
      setForgotSent(true);
    }
  }

  if (mode.kind === 'login') {
    return (
      <LoginForm
        profile={mode.user}
        server={config.serverName && config.serverName !== 'KROMA' ? config.serverName : null}
        busy={busy}
        error={error}
        notice={mode.expired ? t('auth.sessionExpiredHint') : null}
        canGoBack={canPick}
        canUsePasskey={passkeysSupported()}
        methods={methods}
        onProvider={(provider) => void doProvider(provider)}
        onBack={backToPick}
        onSubmit={doLogin}
        onPasskey={doPasskeyLogin}
        onForgot={(identifier) => {
          setError(null);
          setForgotSent(false);
          setMode({ kind: 'forgot', identifier });
        }}
      />
    );
  }

  if (mode.kind === 'forgot') {
    return (
      <ForgotForm
        initialIdentifier={mode.identifier}
        busy={busy}
        sent={forgotSent}
        onBack={() => {
          setError(null);
          setMode({ kind: 'login', user: null });
        }}
        onSubmit={doForgot}
      />
    );
  }

  if (mode.kind === 'register') {
    return (
      <RegisterForm
        busy={busy}
        error={error}
        canGoBack={profiles.length > 0}
        onBack={backToPick}
        onSubmit={doRegister}
      />
    );
  }

  if (mode.kind === 'pin') {
    const account = mode.account;
    return (
      <PinEntry
        account={account}
        onBack={backToPick}
        onSubmit={(pin) => activate(account, pin)}
        onExpired={() => {
          setError(null);
          setMode({ kind: 'login', user: account.user, expired: true });
        }}
      />
    );
  }

  const tiles = pickerTiles({ accounts, profiles, kids: kids.profiles });
  const door = kidsDoor(accounts);

  return (
    <ProfilePicker
      tiles={tiles}
      error={error}
      onPick={(tile) => {
        setError(null);
        void pick(tile);
      }}
      onAddKids={door ? () => void addKids(door) : undefined}
      onForget={forget}
      onAdd={() => {
        setError(null);
        setMode({ kind: 'login', user: null });
      }}
    />
  );
}
