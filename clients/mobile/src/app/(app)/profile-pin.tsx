// Profile lock: set / change / remove the 4-digit profile PIN and toggle
// Face ID / Touch ID. On PIN profiles the toggle keeps the PIN in the
// biometric vault (Face ID instead of the pad); on PIN-less profiles it arms
// a standalone device lock enforced at the gate and on app launch. PIN entry
// is a one-step-at-a-time wizard; the server verifies the current PIN.

import { apiErrorText } from '@kroma/core';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '../../components/PageHeader';
import { BioSwitchRow, LockCard, PinWizard } from '../../components/profileLock';
import { Button, ErrorBanner, Screen } from '../../components/ui';
import { useT } from '../../lib/i18n';
import { boxed, contentWidth } from '../../lib/layout';
import { useClient, useSession } from '../../lib/session';
import {
  canStoreBiometricPin,
  deletePinBehindBiometrics,
  isBiometricLockEnabled,
  isBiometricUnlockEnabled,
  passBiometricLock,
  savePinBehindBiometrics,
  setBiometricLockEnabled,
  setBiometricUnlockEnabled,
} from '../../lib/storage';
import { colors, spacing, type } from '../../lib/theme';

/** Where a completed "enter your current PIN" step goes next. */
type After = 'new' | 'remove' | 'bio';

type Step =
  | { kind: 'menu' }
  | { kind: 'current'; after: After }
  | { kind: 'new'; current?: string }
  | { kind: 'confirm'; current?: string; first: string };

export default function ProfilePin() {
  const t = useT();
  const client = useClient();
  const { user, setUser, serverUrl } = useSession();
  const hasPin = user?.hasPin ?? false;

  const [step, setStep] = useState<Step>({ kind: 'menu' });
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const bioSupported = canStoreBiometricPin();

  // The switch means "Face ID instead of the pad" on PIN profiles (vault) and
  // "Face ID required to open this profile" on PIN-less ones (standalone lock).
  useEffect(() => {
    if (!serverUrl || !user) return;
    const load = user.hasPin ? isBiometricUnlockEnabled : isBiometricLockEnabled;
    void load(serverUrl, user.id).then(setBioEnabled);
  }, [serverUrl, user]);

  const begin = (next: Step) => {
    setStep(next);
    setPin('');
    setError(null);
    setSaved(false);
  };

  const backToMenu = (didSave: boolean, message: string | null = null) => {
    setStep({ kind: 'menu' });
    setPin('');
    setError(message);
    setSaved(didSave);
  };

  /** Refresh the biometric vault so Face ID keeps working after a change. */
  const syncVault = async (newPin: string | null) => {
    if (!serverUrl || !user) return;
    if (newPin && bioEnabled && bioSupported)
      await savePinBehindBiometrics(serverUrl, user.id, newPin);
    else if (!newPin) await deletePinBehindBiometrics(serverUrl, user.id);
  };

  const submitPin = async (code: string, current?: string) => {
    setBusy(true);
    try {
      const { user: updated } = await client.setPin(code, current);
      setUser(updated);
      if (!hasPin && serverUrl && user) {
        // First PIN on this profile: an active standalone lock folds into the
        // PIN vault (same switch position, Face ID now supplies the PIN).
        if (bioEnabled) await setBiometricUnlockEnabled(serverUrl, user.id, true);
        await setBiometricLockEnabled(serverUrl, user.id, false);
      }
      await syncVault(code);
      backToMenu(true);
    } catch (err) {
      backToMenu(false, apiErrorText(err, t('account.saveFailed')));
    } finally {
      setBusy(false);
    }
  };

  const removePin = async (code: string) => {
    setBusy(true);
    try {
      const { user: updated } = await client.clearPin(code);
      setUser(updated);
      await syncVault(null);
      backToMenu(true);
    } catch (err) {
      setPin('');
      setError(apiErrorText(err, t('auth.pinIncorrect')));
    } finally {
      setBusy(false);
    }
  };

  const enableBio = async (code: string) => {
    if (!serverUrl || !user) return;
    setBusy(true);
    try {
      await client.pinVerify(code);
      const stored = await savePinBehindBiometrics(serverUrl, user.id, code);
      if (!stored) {
        backToMenu(false, t('account.saveFailed'));
        return;
      }
      await setBiometricUnlockEnabled(serverUrl, user.id, true);
      setBioEnabled(true);
      backToMenu(true);
    } catch (err) {
      setPin('');
      setError(apiErrorText(err, t('auth.pinIncorrect')));
    } finally {
      setBusy(false);
    }
  };

  const disableBio = async () => {
    if (!serverUrl || !user) return;
    setBioEnabled(false);
    if (hasPin) {
      await setBiometricUnlockEnabled(serverUrl, user.id, false);
      await deletePinBehindBiometrics(serverUrl, user.id);
    } else {
      await setBiometricLockEnabled(serverUrl, user.id, false);
    }
  };

  /** PIN-less profile: arm the standalone lock, confirming with a biometric
   * prompt so a device that can't actually pass never ends up locked out. */
  const enableBioLock = async () => {
    if (!serverUrl || !user) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const armed =
        (await setBiometricLockEnabled(serverUrl, user.id, true)) &&
        (await passBiometricLock(serverUrl, user.id, t('auth.faceUnlock')));
      if (!armed) {
        await setBiometricLockEnabled(serverUrl, user.id, false);
        setError(t('account.saveFailed'));
        return;
      }
      setBioEnabled(true);
      setSaved(true);
    } finally {
      setBusy(false);
    }
  };

  /** Four digits are in: advance the wizard (or fire the matching call). */
  const complete = (code: string) => {
    if (step.kind === 'current') {
      if (step.after === 'remove') void removePin(code);
      else if (step.after === 'bio') void enableBio(code);
      else begin({ kind: 'new', current: code });
      return;
    }
    if (step.kind === 'new') {
      begin({ kind: 'confirm', current: step.current, first: code });
      return;
    }
    if (step.kind === 'confirm') {
      if (code !== step.first) {
        begin({ kind: 'new', current: step.current });
        setError(t('account.pinMismatch'));
        return;
      }
      void submitPin(code, step.current);
    }
  };

  const stepSubtitle = () => {
    if (step.kind === 'current')
      return step.after === 'remove' ? t('pin.clearSubtitle') : t('pin.changeSubtitle');
    if (step.kind === 'confirm') return t('pin.confirmSubtitle');
    return t('pin.setSubtitle');
  };

  const bioLabel =
    Platform.OS === 'ios' ? t('account.biometricUnlockIos') : t('account.biometricUnlock');

  return (
    <Screen padded={false}>
      <PageHeader title={t('account.profileLock')} />
      {step.kind === 'menu' ? (
        <View style={styles.body}>
          <LockCard
            title={t('account.pin')}
            sub={hasPin ? t('account.pinSubSet') : t('account.pinSub')}
          >
            {hasPin ? (
              <View style={styles.buttons}>
                <Button
                  label={t('account.changePin')}
                  onPress={() => begin({ kind: 'current', after: 'new' })}
                />
                <Button
                  label={t('account.removePin')}
                  kind="ghost"
                  onPress={() => begin({ kind: 'current', after: 'remove' })}
                />
              </View>
            ) : (
              <Button label={t('account.setPin')} onPress={() => begin({ kind: 'new' })} />
            )}
          </LockCard>

          {bioSupported ? (
            <LockCard
              title={bioLabel}
              sub={hasPin ? t('account.biometricUnlockSub') : t('account.biometricLockSub')}
            >
              <BioSwitchRow
                label={bioLabel}
                value={bioEnabled}
                disabled={busy}
                onChange={(next) => {
                  if (!next) void disableBio();
                  else if (hasPin) begin({ kind: 'current', after: 'bio' });
                  else void enableBioLock();
                }}
              />
            </LockCard>
          ) : null}

          {saved ? <Text style={styles.saved}>{t('account.profileSaved')}</Text> : null}
          <ErrorBanner message={error} />
        </View>
      ) : (
        <PinWizard
          subtitle={stepSubtitle()}
          pin={pin}
          busy={busy}
          error={error}
          onChange={(next) => {
            setPin(next);
            if (next.length === 4) complete(next);
          }}
          onCancel={() => backToMenu(false)}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.md, gap: spacing.lg, ...boxed(contentWidth.form) },
  buttons: { gap: 10 },
  saved: { ...type.caption, color: colors.accent, textAlign: 'center' },
});
