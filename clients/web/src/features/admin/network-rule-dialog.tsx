import type { DeclaredPurpose, NetworkView, Rule } from '@kromatv/client/network';
import { useT } from '@kromatv/ui';
import { Dialog, Field } from '@kromatv/ui/kit';
import { useState } from 'react';
import { ChoiceSelect } from '#web/features/admin/network-choice-select';
import { callerChoices, purposeChoices } from '#web/features/admin/network-flows';
import { RuleActionField } from '#web/features/admin/network-rule-action';
import { type RuleDraft, ruleFromDraft } from '#web/features/admin/network-rules';

interface RuleDialogProps {
  initial: RuleDraft;
  id: string;
  adding: boolean;
  purposes: readonly DeclaredPurpose[];
  networks: readonly NetworkView[];
  callerName: (caller: string) => string;
  onDone: (rule: Rule) => void;
  onCancel: () => void;
}

export function RuleDialog({
  initial,
  id,
  adding,
  purposes,
  networks,
  callerName,
  onDone,
  onCancel,
}: Readonly<RuleDialogProps>) {
  const t = useT();
  const [draft, setDraft] = useState(initial);
  const [touched, setTouched] = useState(false);
  const result = ruleFromDraft(draft, id);
  const edit = (patch: Partial<RuleDraft>) => setDraft((previous) => ({ ...previous, ...patch }));

  const confirm = () => {
    setTouched(true);
    if (result.ok) onDone(result.rule);
  };

  return (
    <Dialog.Root
      open
      title={adding ? t('network.ruleAddTitle') : t('network.ruleEditTitle')}
      width="md"
      onClose={onCancel}
    >
      <Field.Root label={t('network.colCaller')}>
        <ChoiceSelect
          block
          label={t('network.colCaller')}
          anyLabel={t('network.anyCaller')}
          value={draft.caller}
          choices={callerChoices(purposes, [], draft.caller)}
          nameOf={callerName}
          onValueChange={(caller) => edit({ caller, purpose: null })}
        />
      </Field.Root>
      <Field.Root label={t('network.colPurpose')}>
        <ChoiceSelect
          block
          label={t('network.colPurpose')}
          anyLabel={t('network.anyPurpose')}
          value={draft.purpose}
          choices={purposeChoices(purposes, [], draft.caller, draft.purpose)}
          onValueChange={(purpose) => edit({ purpose })}
        />
      </Field.Root>
      <Field.Root
        label={t('network.colHost')}
        error={
          touched && !result.ok && result.field === 'host' ? t('network.hostInvalid') : undefined
        }
        value={draft.host}
        onValueChange={(host) => edit({ host })}
      >
        <Field.Input placeholder={t('network.hostPlaceholder')} onBlur={() => setTouched(true)} />
        <Field.Hint>{t('network.hostHint')}</Field.Hint>
      </Field.Root>
      <Field.Root
        label={t('network.colPort')}
        error={
          touched && !result.ok && result.field === 'port' ? t('network.portInvalid') : undefined
        }
        value={draft.port}
        onValueChange={(port) => edit({ port })}
      >
        <Field.Input placeholder={t('network.portPlaceholder')} onBlur={() => setTouched(true)} />
      </Field.Root>
      <Field.Root
        label={t('network.colAddress')}
        error={
          touched && !result.ok && result.field === 'address'
            ? t('network.addressRangeInvalid')
            : undefined
        }
        value={draft.address}
        onValueChange={(address) => edit({ address })}
      >
        <Field.Input
          placeholder={t('network.addressRangePlaceholder')}
          onBlur={() => setTouched(true)}
        />
        <Field.Hint>{t('network.addressRangeHint')}</Field.Hint>
      </Field.Root>
      <RuleActionField
        value={draft.action}
        networks={networks}
        onChange={(action) => edit({ action })}
      />
      <Field.Root
        label={t('network.colNote')}
        value={draft.note}
        onValueChange={(note) => edit({ note })}
      >
        <Field.Input placeholder={t('network.notePlaceholder')} />
      </Field.Root>
      <Dialog.Footer>
        <Dialog.Actions
          onCancel={onCancel}
          cancelLabel={t('common.cancel')}
          onConfirm={confirm}
          confirmLabel={adding ? t('network.ruleAdd') : t('network.ruleApply')}
        />
      </Dialog.Footer>
    </Dialog.Root>
  );
}
