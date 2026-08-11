// The login gate, rendered as a full-screen overlay whenever no session is
// active so the catalogue underneath stays unusable until an account is chosen.

import {
  apiErrorText,
  KromaApiError,
  type PublicUser,
  type StoredSession,
  UserId,
} from '@kroma/core';
import { type ActivateResult, useT } from '@kroma/ui';
import {
  AddTile,
  Box,
  Spinner as BusyRing,
  Button,
  Focusable,
  Icon,
  Logo,
  OtpField,
  Row,
  type StyleDecl,
  styles,
  svFor,
  Text,
} from '@kroma/ui/kit';
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { LoginForm, RegisterForm } from '#web/features/accounts/auth-forms';
import { LoginBackdrop } from '#web/features/accounts/login-backdrop';
import { LoginSettings } from '#web/features/accounts/login-settings';
import { useAuth } from '#web/shared/lib/auth';
import { passkeysSupported } from '#web/shared/lib/webauthn';
import { PAGE_RADIAL } from '#web/shared/ui';
import { UserAvatar } from '#web/shared/ui/user-avatar';

type Mode =
  | { kind: 'pick' }
  | { kind: 'login'; user: PublicUser | null; expired?: boolean }
  | { kind: 'register' }
  | { kind: 'pin'; account: StoredSession };

const AVATAR = 146;
const AVATAR_RADIUS = 22;

// The amber edge the row's tiles take, drawn on the avatar rather than around
// the whole column: the caption below is part of the control, not part of the
// picture. Same shape <AddTile> beside them takes.
const profileTile = svFor<{ root: StyleDecl; well: StyleDecl; label: StyleDecl }>()({
  slots: {
    root: { align: 'center', gap: 14 },
    well: {
      radius: AVATAR_RADIUS,
      shadow: 'card',
      _hover: { ring: 'focus' },
      _focus: { ring: 'focus' },
    },
    label: { color: 'text/82', fontWeight: '500' },
  },
});

const forgetLink = svFor<{ root: StyleDecl; label: StyleDecl }>()({
  slots: {
    root: {},
    label: { color: 'textDim', _hover: { color: 'text' }, _focus: { color: 'text' } },
  },
});

const s = styles({
  tiles: { columnGap: 28, rowGap: 36, alignContent: 'flex-start' },
});

// Declared in styles.css, so the rejected PIN shakes without a keyframe the
// vocabulary has no spelling for.
const SHAKE: CSSProperties = { animation: 'otp-shake 0.4s ease' };

// The gate is one viewport tall, and the kit carries no viewport unit: every
// screen it draws sits on a fixed 1920x1080 stage instead. So the two frames
// that measure themselves against the window stay plain CSS.
const GATE: CSSProperties = {
  position: 'relative',
  display: 'flex',
  width: '100%',
  minHeight: '100vh',
  overflowX: 'hidden',
  background: PAGE_RADIAL,
};

const GATE_COLUMN: CSSProperties = {
  position: 'relative',
  zIndex: 10,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  width: '100%',
  minHeight: '100vh',
  overflowY: 'auto',
  padding: '48px 24px',
};

const GATE_CENTRED: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  minHeight: '100vh',
  background: PAGE_RADIAL,
};

export function LoginGate() {
  const { ready } = useAuth();
  return (
    <div style={GATE}>
      <LoginBackdrop />
      <LoginSettings />
      {/* Centred via the child's auto margins, not justify-center: a centred
          scroll container clips overflow ABOVE the fold out of reach on short
          viewports, while my-auto degrades to a normal scroll from the top. */}
      <div style={GATE_COLUMN}>
        <Box my="auto" w="100%" align="center">
          <Brand />
          {ready ? <GateBody /> : <Spinner />}
        </Box>
      </div>
    </div>
  );
}

export function Brand() {
  return (
    <Box mb={48}>
      <Logo size={38} />
    </Box>
  );
}

export function Spinner() {
  return <Logo markOnly size={40} spin="loading" />;
}

/** Shown by authenticated layouts while the session hydrates or a redirect to
 * /login is in flight (see {@link useRequireAuth}). */
export function GateLoading() {
  return (
    <div style={GATE_CENTRED}>
      <Spinner />
    </div>
  );
}

export function GateBody() {
  const t = useT();
  const { client, accounts, login, loginPasskey, register, activate, forget } = useAuth();
  const [profiles, setProfiles] = useState<PublicUser[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: 'pick' });
  const [canPick, setCanPick] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The picker always renders remembered accounts too (see below), so switching
  // profiles works TV-style even with a private roster.
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

  // Remembered local accounts first (one-tap switch, no password), then any
  // public-roster profiles not already remembered (a tap asks for their
  // password).
  const tiles: {
    id: string;
    username: string;
    avatarUrl: string | null;
    remembered: StoredSession | null;
    locked: boolean;
  }[] = [
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

  const pick = async (tile: (typeof tiles)[number]) => {
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
    <Box w="100%" maxW={896} align="center">
      <Text variant="h1" accessibilityRole="header" textAlign="center">
        {t('auth.whoWatching')}
      </Text>
      <Text variant="body" color="textMuted" textAlign="center" maxW={576} mt={12} mb={48}>
        {t('auth.whoWatchingHint')}
      </Text>

      <Box
        row
        wrap
        w="100%"
        maxW={1100}
        align="flex-start"
        justify="center"
        px={24}
        py={16}
        style={s.tiles}
      >
        {tiles.map((p) => (
          <Box key={p.id} w={150} align="center" gap={12}>
            <ProfileTile
              username={p.username}
              avatarUrl={p.avatarUrl}
              seed={p.id}
              locked={p.locked}
              lockedLabel={t('auth.passwordRequired')}
              onPress={() => void pick(p)}
            />
            {p.remembered ? (
              <Focusable
                sv={forgetLink}
                ring={false}
                label={t('auth.logout')}
                onPress={() => forget(p.id)}
              >
                {({ slots }) => (
                  <Text variant="meta" style={slots.label}>
                    {t('auth.logout')}
                  </Text>
                )}
              </Focusable>
            ) : null}
          </Box>
        ))}

        <Box w={150} align="center">
          <AddTile
            label={t('auth.addProfile')}
            onPress={() => {
              setError(null);
              setMode({ kind: 'login', user: null });
            }}
          />
        </Box>
      </Box>

      {error ? (
        <Text variant="meta" color="danger" mt={32}>
          {error}
        </Text>
      ) : null}
    </Box>
  );
}

function ProfileTile({
  username,
  avatarUrl,
  seed,
  locked,
  lockedLabel,
  onPress,
}: Readonly<{
  username: string;
  avatarUrl: string | null;
  seed: string;
  locked: boolean;
  lockedLabel: string;
  onPress: () => void;
}>) {
  return (
    <Focusable sv={profileTile} ring={false} focusScale={1.06} label={username} onPress={onPress}>
      {({ slots }) => (
        <>
          <Box style={slots.well}>
            <UserAvatar
              name={username}
              avatarUrl={avatarUrl}
              seed={seed}
              size={AVATAR}
              radius={AVATAR_RADIUS}
            />
            {locked ? (
              // Solid surface, never a translucent one: an alpha background
              // lets the avatar gradient bleed through and muddies the icon.
              <Box
                absolute
                right={8}
                bottom={8}
                center
                w={30}
                h={30}
                radius="circle"
                border="white/12"
                bg="surface2"
                shadow="card"
                accessibilityLabel={lockedLabel}
              >
                <Icon name="lock" size={15} stroke={2.2} color="accent" />
              </Box>
            ) : null}
          </Box>
          <Text variant="body" style={slots.label}>
            {username}
          </Text>
        </>
      )}
    </Focusable>
  );
}

function PinEntry({
  account,
  onBack,
  onSubmit,
  onExpired,
}: Readonly<{
  account: StoredSession;
  onBack: () => void;
  onSubmit: (pin: string) => Promise<ActivateResult>;
  onExpired: () => void;
}>) {
  const t = useT();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [cooldown, setCooldown] = useState(0);

  // Lockout countdown (429).
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const locked = busy || cooldown > 0;

  const submit = async (value: string) => {
    if (locked) return;
    setBusy(true);
    setError(null);
    const r = await onSubmit(value);
    setBusy(false);
    if (r.ok) return; // the gate unmounts on success
    // Dead token, not a wrong PIN: a PIN can't fix it, so route to a full re-login.
    if (!r.needsPin) {
      onExpired();
      return;
    }
    setPin('');
    if (r.retryAfter) setCooldown(r.retryAfter);
    setError(r.error || t('auth.pinIncorrect'));
    setShake((n) => n + 1);
  };

  let status: ReactNode = null;
  if (busy) {
    status = (
      <>
        <BusyRing size={16} thickness={2} />
        <Text variant="meta" color="textMuted">
          {t('pin.verifying')}
        </Text>
      </>
    );
  } else if (error) {
    status = (
      <Text variant="meta" color="danger">
        {cooldown > 0 ? t('pin.lockedRetry', { seconds: cooldown }) : error}
      </Text>
    );
  }

  return (
    <Box w="100%" maxW={360} align="center" gap={24}>
      <UserAvatar
        name={account.user.username}
        avatarUrl={account.user.avatarUrl}
        seed={account.user.id}
        size={96}
      />
      <Text variant="h2">{account.user.username}</Text>
      <Text variant="meta" color="textMuted">
        {t('pin.verifySubtitle')}
      </Text>

      {/* key={shake} remounts the row so the shake animation replays each error. */}
      <div key={shake} style={shake ? SHAKE : undefined}>
        <OtpField.Root
          maxLength={4}
          value={pin}
          onValueChange={(v) => {
            setError(null);
            setPin(v);
          }}
          onComplete={(value) => void submit(value)}
          mask
          physicalKeyboard
          autoFocus
          disabled={locked}
          label={t('account.currentPin')}
        />
      </div>

      <Row h={20} gap={8}>
        {status}
      </Row>

      <Button
        variant="ghost"
        size="sm"
        icon="chevron-left"
        label={t('common.back')}
        onPress={onBack}
      />
    </Box>
  );
}
