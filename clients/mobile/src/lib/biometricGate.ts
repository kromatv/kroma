// Boot-time face of the standalone biometric lock (profiles without a server
// PIN). Lives outside session.tsx because the prompt string needs a translator
// and SessionProvider mounts above I18nProvider: the device locale is resolved
// directly here.

import { createTranslator, DEFAULT_LOCALE, normalizeLocale } from '@kroma/core';
import { getLocales } from 'expo-localization';
import { isBiometricLockEnabled, type MobileAccount, passBiometricLock } from './storage';

/** True when the profile may open: PIN-locked profiles pass (the server gates
 * them), unlocked ones pass, and biometric-locked ones only after the system
 * prompt (labelled `prompt`) succeeds. */
export async function passProfileBiometricGate(
  account: MobileAccount,
  prompt: string,
): Promise<boolean> {
  if (account.user.hasPin) return true;
  if (!(await isBiometricLockEnabled(account.serverUrl, account.user.id))) return true;
  return passBiometricLock(account.serverUrl, account.user.id, prompt);
}

/** The same gate for the cold-start resume, with the prompt translated from
 * the device locale. */
export function passBootBiometricGate(account: MobileAccount): Promise<boolean> {
  const locale =
    getLocales()
      .map((l) => normalizeLocale(l.languageTag))
      .find((l) => l !== null) ?? DEFAULT_LOCALE;
  return passProfileBiometricGate(account, createTranslator(locale)('auth.faceUnlock'));
}
