import { apiErrorText } from '@kromatv/client';
import type { DeclaredPurpose, Rule, RulesUpdate } from '@kromatv/client/network';
import { useT } from '@kromatv/ui';
import { Box, Button, Callout, EmptyState, Row, Spacer, Text, useConfirm } from '@kromatv/ui/kit';
import { useEffect, useState } from 'react';
import { useAsyncAction, usePoll } from '#web/features/admin/hooks';
import { useCallerName } from '#web/features/admin/network-callers';
import { DefaultActionCard } from '#web/features/admin/network-default-action-card';
import { PresetMenu } from '#web/features/admin/network-preset-menu';
import { RULE_PRESETS, type RulePreset, presetRules } from '#web/features/admin/network-presets';
import { RuleDialog } from '#web/features/admin/network-rule-dialog';
import { RuleTable } from '#web/features/admin/network-rule-table';
import {
  draftOf,
  EMPTY_DRAFT,
  freshRuleId,
  moveRule,
  type RuleDraft,
  sameRules,
} from '#web/features/admin/network-rules';
import { useAuth } from '#web/shared/lib/auth';
import { CardSkeleton } from '#web/shared/ui';

const RULES_POLL_MS = 60000;

interface Editing {
  index: number | null;
  id: string;
  draft: RuleDraft;
}

export function RuleEditor({
  onDirtyChange,
}: Readonly<{ onDirtyChange: (dirty: boolean) => void }>) {
  const t = useT();
  const confirm = useConfirm();
  const { client } = useAuth();
  const callerName = useCallerName();
  const { data, reload } = usePoll(
    ['admin', 'network', 'rules'],
    () => client.network.rules(),
    RULES_POLL_MS,
  );
  const [draft, setDraft] = useState<RulesUpdate | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAsyncAction();

  const stored: RulesUpdate | null = data
    ? { defaultAction: data.defaultAction, rules: data.rules }
    : null;
  const current = draft ?? stored;
  const dirty = draft !== null && stored !== null && !sameRules(draft, stored);
  const purposes: readonly DeclaredPurpose[] = data?.purposes ?? [];

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  if (!current) return <CardSkeleton fields={4} />;

  const change = (next: RulesUpdate) => {
    setSaved(false);
    setDraft(next);
  };
  const setRules = (rules: readonly Rule[]) => change({ ...current, rules: [...rules] });

  const pickPreset = async (preset: RulePreset) => {
    const entry = RULE_PRESETS.find((one) => one.preset === preset);
    if (!entry) return;
    if (current.rules.length > 0) {
      const ok = await confirm({
        title: t('network.presetConfirmTitle', { preset: t(entry.labelKey) }),
        message: t('network.presetConfirmMessage', { hint: t(entry.hintKey) }),
        confirmLabel: t('network.presetConfirm'),
        cancelLabel: t('common.cancel'),
      });
      if (!ok) return;
    }
    change(presetRules(preset, purposes));
  };

  const remove = async (index: number) => {
    const ok = await confirm({
      title: t('network.ruleRemoveTitle', { position: index + 1 }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) setRules(current.rules.filter((_, at) => at !== index));
  };

  const save = () =>
    run(
      async () => {
        await client.network.saveRules(current);
        await reload();
        setDraft(null);
        setSaved(true);
      },
      (cause) => apiErrorText(cause, t('network.saveFailed')),
    );

  const finishEditing = (rule: Rule) => {
    if (!editing) return;
    const { index } = editing;
    setRules(
      index === null
        ? [...current.rules, rule]
        : current.rules.map((one, at) => (at === index ? rule : one)),
    );
    setEditing(null);
  };

  return (
    <Box gap={20}>
      <DefaultActionCard
        value={current.defaultAction}
        onChange={(defaultAction) => change({ ...current, defaultAction })}
      />

      <Row wrap gap={12} align="center">
        <Box flex minW={220} gap={3}>
          <Text variant="title">{t('network.rulesTitle')}</Text>
          <Text variant="meta" color="textDim">
            {t('network.rulesHint')}
          </Text>
        </Box>
        <PresetMenu onPick={(preset) => void pickPreset(preset)} />
        <Button
          icon="plus"
          label={t('network.ruleAdd')}
          onPress={() =>
            setEditing({ index: null, id: freshRuleId(current.rules), draft: EMPTY_DRAFT })
          }
        />
      </Row>

      {current.rules.length === 0 ? (
        <EmptyState.Root icon="list-check">
          <EmptyState.Title>{t('network.rulesEmpty')}</EmptyState.Title>
          <EmptyState.Hint>
            {current.defaultAction === 'allow'
              ? t('network.rulesEmptyAllow')
              : t('network.rulesEmptyBlock')}
          </EmptyState.Hint>
        </EmptyState.Root>
      ) : (
        <RuleTable
          rules={current.rules}
          callerName={callerName}
          onMove={(index, offset) => setRules(moveRule(current.rules, index, offset))}
          onEdit={(index) => {
            const rule = current.rules[index];
            if (rule) setEditing({ index, id: rule.id, draft: draftOf(rule) });
          }}
          onRemove={(index) => void remove(index)}
        />
      )}

      {error ? (
        <Callout.Root tone="danger">
          <Callout.Title>{error}</Callout.Title>
        </Callout.Root>
      ) : null}

      <Row gap={12} align="center">
        <Spacer />
        {dirty ? (
          <Text variant="meta" color="textMuted">
            {t('network.unsaved')}
          </Text>
        ) : null}
        {saved && !dirty ? (
          <Text variant="meta" color="success">
            {t('admin.saved')}
          </Text>
        ) : null}
        <Button
          variant="ghost"
          label={t('network.discard')}
          disabled={!dirty || busy}
          onPress={() => setDraft(null)}
        />
        <Button
          icon="device-floppy"
          label={t('common.save')}
          loading={busy}
          disabled={!dirty}
          onPress={() => void save()}
        />
      </Row>

      {editing ? (
        <RuleDialog
          initial={editing.draft}
          id={editing.id}
          adding={editing.index === null}
          purposes={purposes}
          callerName={callerName}
          onDone={finishEditing}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </Box>
  );
}
