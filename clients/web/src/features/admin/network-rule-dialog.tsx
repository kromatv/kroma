import type { DeclaredPurpose, Rule, RuleAction } from '@kromatv/client/network';
import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Dialog, Field, SegmentGroup } from '@kromatv/ui/kit';
import { useState } from 'react';
import { ChoiceSelect } from '#web/features/admin/network-choice-select';
import { callerChoices, purposeChoices } from '#web/features/admin/network-flows';
import { type RuleDraft, ruleFromDraft } from '#web/features/admin/network-rules';

const RULE_ACTIONS: readonly { action: RuleAction; labelKey: MessageKey }[] = [
  { action: 'direct', labelKey: 'network.actionDirect' },
  { action: 'vpn', labelKey: 'network.actionVpn' },
  { action: 'block', labelKey: 'network.actionBlock' },
];

interface RuleDialogProps {
  initial: RuleDraft;
  id: string;
  adding: boolean;
  purposes: readonly DeclaredPurpose[];
  callerName: (caller: string) => string;
  onDone: (rule: Rule) => void;
  onCancel: () => void;
}

export function RuleDialog({
  initial,
  id,
  adding,
  purposes,
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
        error={touched && !result.ok ? t('network.hostInvalid') : undefined}
        value={draft.host}
        onValueChange={(host) => edit({ host })}
      >
        <Field.Input placeholder={t('network.hostPlaceholder')} onBlur={() => setTouched(true)} />
        <Field.Hint>{t('network.hostHint')}</Field.Hint>
      </Field.Root>
      <Field.Root label={t('network.colAction')}>
        <SegmentGroup.Root<RuleAction>
          label={t('network.colAction')}
          value={draft.action}
          onValueChange={(action) => edit({ action })}
        >
          {RULE_ACTIONS.map((one) => (
            <SegmentGroup.Item key={one.action} value={one.action}>
              <SegmentGroup.Label>{t(one.labelKey)}</SegmentGroup.Label>
            </SegmentGroup.Item>
          ))}
        </SegmentGroup.Root>
      </Field.Root>
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
