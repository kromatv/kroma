import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { type FocusHandle, ListRow, styles, Text, useStyles } from '@kromatv/ui/kit';
import { type RefObject, useEffect, useState } from 'react';
import type { RowIcon } from '#tv/app/settings/items';
import { useAuth } from '#tv/app/providers/auth';
import { useConnection } from '#tv/app/providers/connection';
import { isPinLockout, PinEntry } from '../PinEntry';

type Step =
  | { kind: 'menu'; done: boolean }
  | { kind: 'current'; then: 'change' | 'remove' }
  | { kind: 'new'; current?: string }
  | { kind: 'confirm'; current?: string; first: string };

interface PinAction {
  icon: RowIcon;
  label: MessageKey;
  step: Step;
}

const SET: readonly PinAction[] = [
  { icon: 'lock', label: 'profileMenu.setPin', step: { kind: 'new' } },
];

const MANAGE: readonly PinAction[] = [
  {
    icon: 'pencil',
    label: 'profileMenu.changePin',
    step: { kind: 'current', then: 'change' },
  },
  {
    icon: 'lock-open',
    label: 'profileMenu.removePin',
    step: { kind: 'current', then: 'remove' },
  },
];

function subtitle(step: Exclude<Step, { kind: 'menu' }>): MessageKey {
  if (step.kind === 'current')
    return step.then === 'remove' ? 'pin.clearSubtitle' : 'pin.changeSubtitle';
  return step.kind === 'confirm' ? 'pin.confirmSubtitle' : 'pin.setSubtitle';
}

/** The profile's PIN in the settings' right pane: its state, the actions on it, and
 * the keypad they open. Removing or changing a PIN asks for the current one first. */
export function PinPanel({ entry }: Readonly<{ entry: RefObject<FocusHandle | null> }>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const { client } = useConnection();
  const { user, updateUser } = useAuth();
  const [step, setStep] = useState<Step>({ kind: 'menu', done: false });
  const settled = step.kind === 'menu' && step.done;

  useEffect(() => {
    if (settled) entry.current?.focus();
  }, [settled, entry]);
  if (!user) return null;

  const save = async (pin: string, current?: string): Promise<MessageKey | undefined> => {
    try {
      const res = await client?.accounts.setPin(pin, current);
      if (!res) return undefined;
      updateUser(res.user);
      setStep({ kind: 'menu', done: true });
      return undefined;
    } catch (e) {
      if (current === undefined || isPinLockout(e)) throw e;
      setStep({ kind: 'current', then: 'change' });
      return 'auth.pinCurrentWrong';
    }
  };

  const remove = async (current: string) => {
    const res = await client?.accounts.clearPin(current);
    if (!res) return;
    updateUser(res.user);
    setStep({ kind: 'menu', done: true });
  };

  const submit = async (pin: string): Promise<MessageKey | undefined> => {
    if (step.kind === 'current') {
      if (step.then === 'remove') {
        await remove(pin);
        return undefined;
      }
      setStep({ kind: 'new', current: pin });
      return undefined;
    }
    if (step.kind === 'new') {
      setStep({ kind: 'confirm', current: step.current, first: pin });
      return undefined;
    }
    if (step.kind !== 'confirm') return undefined;
    if (pin !== step.first) {
      setStep({ kind: 'new', current: step.current });
      return 'pin.mismatch';
    }
    return save(pin, step.current);
  };

  if (step.kind !== 'menu') {
    return (
      <>
        <Text variant="bodyTv" color="textDim">
          {t(subtitle(step))}
        </Text>
        <PinEntry
          label={t(subtitle(step))}
          onSubmit={submit}
          wrongKey={step.kind === 'current' ? 'auth.pinCurrentWrong' : 'auth.pinInvalid'}
          align="flex-start"
        />
      </>
    );
  }

  return (
    <>
      <Text variant="bodyTv" color="textDim" style={s.description}>
        {t(user.hasPin ? 'settings.pinOnDesc' : 'settings.pinOffDesc')}
      </Text>
      {(user.hasPin ? MANAGE : SET).map((action, index) => (
        <ListRow.Root
          key={action.label}
          ground="surface"
          icon={action.icon}
          focusHandle={index === 0 ? entry : undefined}
          onPress={() => setStep(action.step)}
        >
          <ListRow.Label>{t(action.label)}</ListRow.Label>
        </ListRow.Root>
      ))}
    </>
  );
}

const sDefinition = styles({
  description: { maxW: 720, mb: 24 },
});
