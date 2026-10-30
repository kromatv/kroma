import type { DeclaredPurpose, Rule, RuleAction } from '@kromatv/client/network';
import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Dialog, Field, SegmentGroup, Select } from '@kromatv/ui/kit';
import { useState } from 'react';
import { callerChoices, purposeChoices } from '#web/features/admin/network-flows';
import { type RuleDraft, ruleFromDraft } from '#web/features/admin/network-rules';

const ANY = '*';

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
  const picked = (value: string) => (value === ANY ? null : value);

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
        <Select.Root
          label={t('network.colCaller')}
          value={draft.caller ?? ANY}
          onValueChange={(value) => edit({ caller: picked(value), purpose: null })}
        >
          <Select.Trigger block />
          <Select.Item value={ANY} label={t('network.anyCaller')} />
          {callerChoices(purposes, [], draft.caller).map((caller) => (
            <Select.Item key={caller} value={caller} label={callerName(caller)} />
          ))}
        </Select.Root>
      </Field.Root>
      <Field.Root label={t('network.colPurpose')}>
        <Select.Root
          label={t('network.colPurpose')}
          value={draft.purpose ?? ANY}
          onValueChange={(value) => edit({ purpose: picked(value) })}
        >
          <Select.Trigger block />
          <Select.Item value={ANY} label={t('network.anyPurpose')} />
          {purposeChoices(purposes, [], draft.caller, draft.purpose).map((purpose) => (
            <Select.Item key={purpose} value={purpose} label={purpose} />
          ))}
        </Select.Root>
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
