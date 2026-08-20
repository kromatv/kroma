import {
  apiErrorText,
  KromaApiError,
  type PublicUser,
  type StoredSession,
  UserId,
} from '@kroma/core';
import { useT } from '@kroma/ui';
import { useEffect, useState } from 'react';
import { LoginForm, RegisterForm } from '#web/features/accounts/auth-forms';
import { PinEntry } from '#web/features/accounts/pin-entry';
import { type ProfileChoice, ProfilePicker } from '#web/features/accounts/profile-picker';
import { useAuth } from '#web/shared/lib/auth';
import { passkeysSupported } from '#web/shared/lib/webauthn';

type Mode =
  | { kind: 'pick' }
  | { kind: 'login'; user: PublicUser | null; expired?: boolean }
  | { kind: 'register' }
  | { kind: 'pin'; account: StoredSession };

export function GateBody() {
  const t = useT();
  const { client, accounts, login, loginPasskey, register, activate, forget } = useAuth();
  const [profiles, setProfiles] = useState<PublicUser[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: 'pick' });
  const [canPick, setCanPick] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .authConfig()
      .then((cfg) => {
        if (cancelled) return;
        setCanPick(cfg.publicUserList);
        if (!cfg.hasAccounts) {
          setMode({ kind: 'register' });
          return;
        }
        if (!cfg.publicUserList) {
          setMode(accounts.length > 0 ? { kind: 'pick' } : { kind: 'login', user: null });
          return;
        }
        client
          .users()
          .then((u) => {
            if (!cancelled) setProfiles(u);
          })
          .catch(() => undefined);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, accounts]);

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

  if (mode.kind === 'login') {
    return (
      <LoginForm
        profile={mode.user}
        busy={busy}
        error={error}
        notice={mode.expired ? t('auth.sessionExpiredHint') : null}
        canGoBack={canPick}
        canUsePasskey={passkeysSupported()}
        onBack={() => {
          setError(null);
          setMode({ kind: 'pick' });
        }}
        onSubmit={doLogin}
        onPasskey={doPasskeyLogin}
      />
    );
  }

  if (mode.kind === 'register') {
    return (
      <RegisterForm
        busy={busy}
        error={error}
        canGoBack={profiles.length > 0}
        onBack={() => {
          setError(null);
          setMode({ kind: 'pick' });
        }}
        onSubmit={doRegister}
      />
    );
  }

  if (mode.kind === 'pin') {
    const account = mode.account;
    return (
      <PinEntry
        account={account}
        onBack={() => {
          setError(null);
          setMode({ kind: 'pick' });
        }}
        onSubmit={(pin) => activate(account, pin)}
        onExpired={() => {
          setError(null);
          setMode({ kind: 'login', user: account.user, expired: true });
        }}
      />
    );
  }

  const tiles: ProfileChoice[] = [
    ...accounts.map((a) => ({
      id: a.user.id,
      username: a.user.username,
      avatarUrl: a.user.avatarUrl ?? null,
      remembered: a,
      locked: a.user.hasPin,
    })),
    ...profiles
      .filter((p) => !accounts.some((a) => a.user.id === p.id))
      .map((p) => ({
        id: p.id,
        username: p.username,
        avatarUrl: p.avatarUrl ?? null,
        remembered: null,
        locked: true,
      })),
  ];

  const pick = async (tile: ProfileChoice) => {
    setError(null);
    const acc = tile.remembered;
    if (!acc) {
      setMode({
        kind: 'login',
        user: {
          id: UserId.of(tile.id),
          username: tile.username,
          avatarUrl: tile.avatarUrl,
          hasPin: false,
        },
      });
      return;
    }
    // Probe with a no-PIN exchange to let the server decide what's needed,
    // rather than trusting the cached `hasPin`.
    const r = await activate(acc);
    if (r.ok) return;
    if (r.needsPin) {
      setMode({ kind: 'pin', account: acc });
      return;
    }
    // Dead token: send them to sign-in (pre-filled) instead of a dead-end PIN
    // prompt.
    setMode({ kind: 'login', user: acc.user, expired: true });
  };

  return (
    <ProfilePicker
      tiles={tiles}
      error={error}
      onPick={(tile) => void pick(tile)}
      onForget={forget}
      onAdd={() => {
        setError(null);
        setMode({ kind: 'login', user: null });
      }}
    />
  );
}
