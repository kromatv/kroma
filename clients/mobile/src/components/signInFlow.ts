// Entering a REMEMBERED profile from the gate: stored device token first, then
// (in order) the standalone Face ID lock, the biometric PIN vault, the PIN pad
// and finally that profile's password. Kept out of sign-in.tsx so the screen
// stays state + presentation wiring.

import { apiErrorText, KromaApiError, type Translate } from '@kroma/core';
import { passProfileBiometricGate } from '#mobile/lib/biometricGate';
import type { AuthSession } from '#mobile/lib/session';
import {
  deletePinBehindBiometrics,
  isBiometricUnlockEnabled,
  type MobileAccount,
  readPinBehindBiometrics,
  savePinBehindBiometrics,
} from '#mobile/lib/storage';
import { keyOf } from './signInHooks';

export type Phase =
  | { kind: 'gate' }
  | { kind: 'server' }
  | { kind: 'pin'; account: MobileAccount }
  | { kind: 'password'; username: string; avatarUrl: string | null }
  | { kind: 'form' };

/** Everything the flow needs from the screen: the session and its setters. */
export interface EnterSavedDeps {
  session: AuthSession;
  t: Translate;
  /** Leave the gate for the app (the screen owns the route). */
  enterApp(): void;
  setBusy(busy: string | null): void;
  setError(error: string | null): void;
  setPin(pin: string): void;
  setPhase(phase: Phase): void;
}

/** The PIN kept behind Face ID for this profile, when the vault is enabled. */
async function vaultedPin(deps: EnterSavedDeps, account: MobileAccount): Promise<string | null> {
  const { serverUrl, user } = account;
  if (!(await isBiometricUnlockEnabled(serverUrl, user.id))) return null;
  return readPinBehindBiometrics(serverUrl, user.id, deps.t('auth.faceUnlock'));
}

/** The server asked for a PIN: try the vault silently, else open the pad. */
async function askForPin(deps: EnterSavedDeps, account: MobileAccount): Promise<void> {
  // Face ID first: a stored PIN unlocks without showing the pad.
  const stored = await vaultedPin(deps, account);
  if (stored) {
    try {
      await deps.session.switchAccount(account, stored);
      deps.enterApp();
      return;
    } catch {
      // The PIN changed since it was stored: drop it, ask on the pad.
      void deletePinBehindBiometrics(account.serverUrl, account.user.id);
    }
  }
  deps.setBusy(null);
  deps.setPin('');
  deps.setPhase({ kind: 'pin', account });
}

/** Revoked device token: forget it, fall back to that profile's password. */
function fallBackToPassword(deps: EnterSavedDeps, account: MobileAccount): void {
  deps.session.forgetAccount(account);
  deps.session.selectServer(account.serverUrl);
  deps.setPhase({
    kind: 'password',
    username: account.user.username,
    avatarUrl: account.user.avatarUrl ?? null,
  });
  deps.setError(deps.t('auth.sessionExpiredHint'));
}

export async function enterSavedAccount(
  deps: EnterSavedDeps,
  account: MobileAccount,
  withPin?: string,
): Promise<void> {
  deps.setBusy(withPin === undefined ? keyOf(account) : 'pin');
  deps.setError(null);
  // PIN-less profiles may carry a device Face ID lock; it must pass first.
  if (!(await passProfileBiometricGate(account, deps.t('auth.faceUnlock')))) {
    deps.setBusy(null);
    return;
  }
  try {
    await deps.session.switchAccount(account, withPin);
    // A PIN typed on the pad worked: keep it behind Face ID for next time
    // (unless biometric unlock is turned off in the profile-lock settings).
    if (withPin !== undefined)
      void isBiometricUnlockEnabled(account.serverUrl, account.user.id).then(
        (enabled) =>
          enabled && savePinBehindBiometrics(account.serverUrl, account.user.id, withPin),
      );
    deps.enterApp();
  } catch (err) {
    if (!(err instanceof KromaApiError)) {
      deps.setBusy(null);
      deps.setError(deps.t('auth.loginFailed'));
      return;
    }
    const body = err.body as { pinRequired?: boolean } | undefined;
    if (body?.pinRequired) {
      await askForPin(deps, account);
      return;
    }
    deps.setBusy(null);
    if (withPin !== undefined) {
      // Wrong or locked PIN: the server message is localized; stay on the pad.
      deps.setPin('');
      deps.setError(apiErrorText(err, deps.t('auth.pinIncorrect')));
      return;
    }
    fallBackToPassword(deps, account);
  }
}
