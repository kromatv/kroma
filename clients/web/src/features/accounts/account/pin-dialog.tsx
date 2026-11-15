import { apiErrorText } from '@kromatv/client';
import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, Button, Dialog, IconWell, OtpField, Progress, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { ForgottenPinDialog } from '#web/features/accounts/account/forgotten-pin-dialog';
import { useAuth } from '#web/shared/lib/auth';

/** What the dialog is for: a first PIN, a new one, or none at all. */
export type PinTask = 'set' | 'change' | 'remove';

type Step = 'current' | 'new' | 'confirm';

const STEPS: Record<PinTask, readonly Step[]> = {
  set: ['new', 'confirm'],
  change: ['current', 'new', 'confirm'],
  remove: ['current'],
};

const TITLE: Record<PinTask, MessageKey> = {
  set: 'account.pinDialogSet',
  change: 'account.pinDialogChange',
  remove: 'account.pinDialogRemove',
};

const ASK: Record<Step, { title: MessageKey; hint: MessageKey }> = {
  current: { title: 'account.pinStepCurrent', hint: 'account.pinStepCurrentHint' },
  new: { title: 'account.pinStepNew', hint: 'account.pinStepNewHint' },
  confirm: { title: 'account.pinStepConfirm', hint: 'account.pinStepConfirmHint' },
};

const DIGITS = 4;

/** Sets, changes or removes the profile PIN one code at a time. A step moves on
 * by itself when its last digit lands, so nothing here needs an OK button. */
export function PinDialog({ task, onClose }: Readonly<{ task: PinTask; onClose: () => void }>) {
  const t = useT();
  const { client, updateUser } = useAuth();
  const steps = STEPS[task];
  const [at, setAt] = useState(0);
  const [current, setCurrent] = useState('');
  const [chosen, setChosen] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [forgot, setForgot] = useState(false);
  const step = steps[at] ?? 'current';

  const restartFrom = (index: number, why: string) => {
    setError(why);
    setAt(index);
    setAttempt((n) => n + 1);
  };

  const commit = async (run: () => Promise<{ user: { hasPin: boolean } }>) => {
    setBusy(true);
    try {
      const { user } = await run();
      updateUser({ hasPin: user.hasPin });
      onClose();
    } catch (e) {
      restartFrom(0, apiErrorText(e, t('account.saveFailed')));
    } finally {
      setBusy(false);
    }
  };

  const entered = (code: string) => {
    setError(null);
    if (step === 'current') {
      setCurrent(code);
      if (task === 'remove') {
        void commit(() => client.accounts.clearPin(code));
      } else {
        setAt(at + 1);
      }
      return;
    }
    if (step === 'new') {
      setChosen(code);
      setAt(at + 1);
      return;
    }
    if (code !== chosen) {
      restartFrom(steps.indexOf('new'), t('account.pinMismatch'));
      return;
    }
    void commit(() => client.accounts.setPin(code, task === 'change' ? current : undefined));
  };

  if (forgot) {
    return <ForgottenPinDialog onClose={onClose} />;
  }

  return (
    <Dialog.Root open title={t(TITLE[task])} width="sm" onClose={busy ? () => {} : onClose}>
      <Box center gap={18} py={8}>
        <IconWell name="lock" size="tv" tone="accent" />
        <Box center gap={6}>
          <Text variant="cardTitle" textAlign="center">
            {t(ASK[step].title)}
          </Text>
          <Text variant="meta" color="textMuted" textAlign="center" maxW={320}>
            {t(ASK[step].hint)}
          </Text>
        </Box>
        <OtpField.Root
          key={`${step}:${attempt}`}
          maxLength={DIGITS}
          mask
          autoFocus
          physicalKeyboard
          disabled={busy}
          invalid={error !== null}
          onComplete={entered}
          label={t(ASK[step].title)}
        />
        <Box center gap={10} minH={44}>
          {error ? (
            <Text variant="meta" color="danger" textAlign="center">
              {error}
            </Text>
          ) : null}
          {steps.length > 1 ? (
            <Box center gap={8}>
              <Box w={120}>
                <Progress
                  value={(at + 1) / steps.length}
                  color="accent"
                  trackColor="tint/10"
                  thickness={4}
                  rounded
                />
              </Box>
              <Text variant="meta" color="textDim">
                {t('account.pinStepOf', { step: at + 1, total: steps.length })}
              </Text>
            </Box>
          ) : null}
        </Box>
        <Box row wrap center gap={8}>
          <Button
            variant="ghost"
            size="sm"
            label={t('common.cancel')}
            onPress={onClose}
            disabled={busy}
          />
          {step === 'current' ? (
            <Button
              variant="ghost"
              size="sm"
              label={t('account.pinForgot')}
              onPress={() => setForgot(true)}
              disabled={busy}
            />
          ) : null}
        </Box>
      </Box>
    </Dialog.Root>
  );
}
