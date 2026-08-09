// The profile gate: every remembered account on this device, across all saved
// servers, on one screen. Presentation lives in the shared onboarding
// components; this file owns state, effects and auth calls.

import { apiErrorText, KromaApiError } from '@kroma/core';
import type { SplashCover } from '@kroma/ui/kit';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { CredentialsPhase, PinPhase } from '#mobile/components/authPhases';
import { OnboardingScreen } from '#mobile/components/OnboardingScreen';
import { type GateTile, ProfileGate } from '#mobile/components/ProfileGate';
import { ServerPicker } from '#mobile/components/ServerPicker';
import { type EnterSavedDeps, enterSavedAccount, type Phase } from '#mobile/components/signInFlow';
import {
  hostOf,
  keyOf,
  useBiometricLockedKeys,
  useClientCache,
  useDiscoveryLoop,
  useServerRoster,
} from '#mobile/components/signInHooks';
import { useT } from '#mobile/lib/i18n';
import { useSession } from '#mobile/lib/session';
import type { MobileAccount } from '#mobile/lib/storage';
import { useServerProbes } from '#mobile/lib/useServerProbes';

export default function SignIn() {
  const t = useT();
  const router = useRouter();
  const session = useSession();
  const { serverUrl, servers, accounts } = session;

  const clientFor = useClientCache();
  const probeUrls = useMemo(() => {
    const set = new Set(accounts.map((a) => a.serverUrl));
    for (const s of servers) set.add(s.url);
    if (serverUrl) set.add(serverUrl);
    // Sorted to keep the probe list, and therefore the effect key, stable
    // across renders.
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [accounts, servers, serverUrl]);
  const probes = useServerProbes(probeUrls);
  const multiServer = new Set(accounts.map((a) => a.serverUrl)).size > 1;
  const serverLabel = (url: string) =>
    probes[url]?.name ?? servers.find((s) => s.url === url)?.name ?? hostOf(url);

  const [phase, setPhase] = useState<Phase>({ kind: 'gate' });
  const [password, setPassword] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { phase: phaseParam } = useLocalSearchParams<{ phase?: string }>();
  useEffect(() => {
    if (phaseParam === 'form') setPhase({ kind: 'form' });
  }, [phaseParam]);

  const bioLocked = useBiometricLockedKeys(accounts);

  const found = useDiscoveryLoop(phase.kind === 'server');
  const discovered = found.filter((f) => !servers.some((s) => s.url === f.url));

  const roster = useServerRoster(serverUrl);
  const rosterOnly = roster.filter(
    (u) => !accounts.some((a) => a.serverUrl === serverUrl && a.user.id === u.id),
  );

  // The gate's splash artwork: the current server's public `/api/splash`
  // sample, the same dressing the web and TV gates wear. No server picked
  // yet means no covers, and the screen keeps its plain wash.
  const [covers, setCovers] = useState<SplashCover[]>([]);
  useEffect(() => {
    if (!serverUrl) return;
    let cancelled = false;
    clientFor(serverUrl)
      .splash()
      .then((entries) => {
        if (cancelled) return;
        setCovers(
          entries.map((e) => ({
            url: e.backdropUrl,
            caption: [e.title, e.year].filter(Boolean).join(' · '),
            eyebrow: t(e.kind === 'show' ? 'content.series' : 'content.film'),
          })),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [serverUrl, clientFor, t]);

  const backToGate = () => {
    setPhase({ kind: 'gate' });
    setPassword('');
    setPin('');
    setError(null);
  };

  const enterDeps: EnterSavedDeps = {
    session,
    t,
    enterApp: () => router.replace('/(app)/(tabs)'),
    setBusy,
    setError,
    setPin,
    setPhase,
  };
  const enterSaved = (account: MobileAccount, withPin?: string) =>
    enterSavedAccount(enterDeps, account, withPin);

  const submit = async (who: string) => {
    if (!who.trim() || !password) return;
    setBusy('login');
    setError(null);
    try {
      await session.login(who.trim(), password);
      router.replace('/(app)/(tabs)');
    } catch (err) {
      setBusy(null);
      if (err instanceof KromaApiError) setError(apiErrorText(err, t('auth.invalidCredentials')));
      else setError(t('auth.loginFailed'));
    }
  };

  const pickSaved = (url: string) => {
    session.selectServer(url);
    setError(null);
    setPhase({ kind: 'form' });
  };

  const connectDiscovered = async (url: string) => {
    setBusy('connect');
    setError(null);
    try {
      await session.connect(url);
      setPhase({ kind: 'form' });
    } catch {
      setError(t('connect.serverNotFound'));
    } finally {
      setBusy(null);
    }
  };

  const gateTiles: GateTile[] = [
    ...accounts.map((account) => {
      const offline = probes[account.serverUrl]?.online === false;
      let caption: string | null = null;
      if (offline) caption = t('profiles.serverOffline');
      else if (multiServer) caption = serverLabel(account.serverUrl);
      return {
        key: keyOf(account),
        name: account.user.username,
        caption,
        avatarUri: clientFor(account.serverUrl).resolveArt(account.user.avatarUrl),
        busy: busy === keyOf(account),
        offline,
        locked: account.user.hasPin || bioLocked.has(keyOf(account)),
        onPress: () => void enterSaved(account),
      };
    }),
    ...rosterOnly.map((profile) => ({
      key: `roster-${profile.id}`,
      name: profile.username,
      avatarUri: serverUrl ? clientFor(serverUrl).resolveArt(profile.avatarUrl) : null,
      locked: profile.hasPin,
      onPress: () =>
        setPhase({
          kind: 'password',
          username: profile.username,
          avatarUrl: profile.avatarUrl ?? null,
        }),
    })),
  ];

  // The screen owns the way back, not each phase: the same control in the same
  // corner on every step, which is what the TV and web gates do. The gate is
  // the root and has nowhere to go; the sign-up form returns to the server
  // list it came from rather than all the way out.
  function backFrom(kind: Phase['kind']): (() => void) | undefined {
    if (kind === 'gate') return undefined;
    if (kind !== 'form') return backToGate;
    return () => {
      setPassword('');
      setError(null);
      setPhase({ kind: 'server' });
    };
  }

  return (
    <OnboardingScreen covers={covers} onBack={backFrom(phase.kind)}>
      {phase.kind === 'gate' && (
        <ProfileGate
          tiles={gateTiles}
          disabled={busy !== null}
          error={error}
          onAdd={() => setPhase({ kind: 'server' })}
        />
      )}
      {phase.kind === 'server' && (
        <ServerPicker
          saved={servers.map((s) => ({
            url: s.url,
            name: serverLabel(s.url),
            host: hostOf(s.url),
            offline: probes[s.url]?.online === false,
          }))}
          discovered={discovered.map((s) => ({
            url: s.url,
            name: s.name ?? null,
            host: hostOf(s.url),
          }))}
          busy={busy !== null}
          error={error}
          onPickSaved={pickSaved}
          onPickDiscovered={(url) => void connectDiscovered(url)}
          onAddServer={() => router.push('/connect')}
        />
      )}
      {phase.kind === 'pin' && (
        <PinPhase
          identity={{
            name: phase.account.user.username,
            avatarUri: clientFor(phase.account.serverUrl).resolveArt(phase.account.user.avatarUrl),
          }}
          pin={pin}
          disabled={busy !== null}
          checking={busy === 'pin'}
          error={error}
          onChange={(next) => {
            setPin(next);
            if (next.length === 4) void enterSaved(phase.account, next);
          }}
        />
      )}
      {(phase.kind === 'password' || phase.kind === 'form') && (
        <CredentialsPhase
          identity={
            phase.kind === 'password'
              ? {
                  name: phase.username,
                  avatarUri: serverUrl ? clientFor(serverUrl).resolveArt(phase.avatarUrl) : null,
                }
              : null
          }
          serverLabel={serverUrl ? serverLabel(serverUrl) : null}
          identifier={identifier}
          password={password}
          busy={busy === 'login'}
          error={error}
          onIdentifier={setIdentifier}
          onPassword={setPassword}
          onSubmit={() => void submit(phase.kind === 'password' ? phase.username : identifier)}
        />
      )}
    </OnboardingScreen>
  );
}
