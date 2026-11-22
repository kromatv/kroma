// The profile gate: every remembered account on this device, across all saved
// servers, on one screen. Presentation lives in the shared onboarding
// components; this file owns state, effects and auth calls.

import { apiErrorText, KromaApiError } from '@kromatv/client';
import { askForKidsProfile, dropKidsProfileAsk, kidsDoor } from '@kromatv/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { CredentialsPhase, PinPhase } from '#mobile/components/auth-phases.component';
import { OnboardingScreen } from '#mobile/components/onboarding-screen.component';
import { ProfileGate } from '#mobile/components/profile-gate.component';
import { ServerPicker } from '#mobile/components/server-picker.component';
import {
  type EnterSavedDeps,
  enterSavedAccount,
  type Phase,
} from '#mobile/components/sign-in-flow';
import { useProviderGate } from '#mobile/components/sign-in-providers.hook';
import { useGateTiles } from '#mobile/components/use-gate-tiles.hook';
import {
  hostOf,
  keyOf,
  useBiometricLockedKeys,
  useClientCache,
  useDiscoveryLoop,
  useServerRoster,
  useSplashCovers,
} from '#mobile/components/sign-in-hooks';
import { useT } from '#mobile/lib/i18n';
import { useSession } from '#mobile/lib/session';
import type { MobileAccount } from '#mobile/lib/storage';
import { useServerProbes } from '#mobile/lib/use-server-probes.hook';

export default function SignIn() {
  const t = useT();
  const router = useRouter();
  const session = useSession();
  const { serverUrl, servers, accounts } = session;

  const clientFor = useClientCache();
  const probeUrls = useMemo(() => {
    const set = new Set(accounts.map((a) => a.serverUrl));
    for (const s of servers) {
      set.add(s.url);
    }
    if (serverUrl) {
      set.add(serverUrl);
    }
    // Sorted to keep the probe list, and therefore the effect key, stable
    // across renders.
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [accounts, servers, serverUrl]);
  const probes = useServerProbes(probeUrls);
  const multiServer = new Set(accounts.map((a) => a.serverUrl)).size > 1;
  const serverLabel = (url: string) =>
    probes[url]?.name ?? servers.find((s) => s.url === url)?.name ?? hostOf(url);

  const { phase: phaseParam } = useLocalSearchParams<{ phase?: string }>();
  const [phase, setPhase] = useState<Phase>(() =>
    phaseParam === 'form' ? { kind: 'form' } : { kind: 'gate' },
  );
  const [seenPhaseParam, setSeenPhaseParam] = useState(phaseParam);
  if (seenPhaseParam !== phaseParam) {
    setSeenPhaseParam(phaseParam);
    if (phaseParam === 'form') {
      setPhase({ kind: 'form' });
    }
  }
  const [password, setPassword] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bioLocked = useBiometricLockedKeys(accounts);

  const found = useDiscoveryLoop(phase.kind === 'server');
  const discovered = found.filter((f) => !servers.some((s) => s.url === f.url));

  const roster = useServerRoster(serverUrl);
  const rosterOnly = roster.filter(
    (u) => !accounts.some((a) => a.serverUrl === serverUrl && a.user.id === u.id),
  );

  const covers = useSplashCovers(serverUrl, clientFor);

  const backToGate = () => {
    dropKidsProfileAsk();
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

  const providers = useProviderGate({
    session,
    clientFor,
    t,
    serverName: serverUrl ? serverLabel(serverUrl) : 'KROMA',
    enterApp: enterDeps.enterApp,
    setBusy,
    setError,
  });

  const submit = async (who: string) => {
    if (!who.trim() || !password) {
      return;
    }
    setBusy('login');
    setError(null);
    try {
      await providers.loginAndClaim(who.trim(), password);
      router.replace('/(app)/(tabs)');
    } catch (err) {
      setBusy(null);
      if (err instanceof KromaApiError) {
        setError(apiErrorText(err, t('auth.invalidCredentials')));
      } else {
        setError(t('auth.loginFailed'));
      }
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

  const gateTiles = useGateTiles({
    accounts,
    roster: rosterOnly,
    serverUrl,
    online: (url) => probes[url]?.online,
    label: (url) => (multiServer ? serverLabel(url) : null),
    busy,
    locked: (account) => account.user.hasPin || bioLocked.has(keyOf(account)),
    clientFor,
    onSaved: (account) => void enterSaved(account),
    onRoster: (profile) =>
      setPhase({
        kind: 'password',
        username: profile.username,
        avatarUrl: profile.avatarUrl ?? null,
      }),
    onKidsOpened: () => enterDeps.enterApp(),
    onKidsFailed: () => setError(t('auth.loginFailed')),
  });
  const door = kidsDoor(accounts);

  // The screen owns the way back, not each phase: the same control in the same
  // corner on every step, which is what the TV and web gates do. The gate is
  // the root and has nowhere to go; the sign-up form returns to the server
  // list it came from rather than all the way out.
  function backFrom(kind: Phase['kind']): (() => void) | undefined {
    if (kind === 'gate') {
      return undefined;
    }
    if (kind !== 'form') {
      return backToGate;
    }
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
          onAddKids={
            door
              ? () => {
                  askForKidsProfile(door.user.id);
                  void enterSaved(door);
                }
              : undefined
          }
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
            avatarUri: clientFor(phase.account.serverUrl).media.artwork.resolve(
              phase.account.user.avatarUrl,
            ),
          }}
          pin={pin}
          disabled={busy !== null}
          checking={busy === 'pin'}
          error={error}
          onChange={(next) => {
            setPin(next);
            if (next.length === 4) {
              void enterSaved(phase.account, next);
            }
          }}
        />
      )}
      {(phase.kind === 'password' || phase.kind === 'form') && (
        <CredentialsPhase
          identity={
            phase.kind === 'password'
              ? {
                  name: phase.username,
                  avatarUri: serverUrl
                    ? clientFor(serverUrl).media.artwork.resolve(phase.avatarUrl)
                    : null,
                }
              : null
          }
          serverLabel={serverUrl ? serverLabel(serverUrl) : null}
          identifier={identifier}
          password={password}
          busy={busy === 'login'}
          providerBusy={busy === 'provider'}
          error={error}
          notice={providers.notice}
          methods={providers.methods}
          resolveImage={(path) =>
            serverUrl ? clientFor(serverUrl).media.artwork.resolve(path) : null
          }
          onIdentifier={setIdentifier}
          onPassword={setPassword}
          onSubmit={() => void submit(phase.kind === 'password' ? phase.username : identifier)}
          onProvider={(provider) => void providers.press(provider)}
        />
      )}
    </OnboardingScreen>
  );
}
