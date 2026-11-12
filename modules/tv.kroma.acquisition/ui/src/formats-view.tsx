import { apiErrorText } from '@kromatv/client';
import { Table, type TableColumn, useAsyncAction, useT } from '@kromatv/module-sdk';
import {
  Box,
  Button,
  Callout,
  EmptyState,
  Menu,
  Row,
  Surface,
  Text,
  useConfirm,
} from '@kromatv/ui/kit';
import { useState } from 'react';
import { useAcquisitionApi } from './api';
import { blankCondition } from './condition-draft';
import { modeOf } from './condition-mode';
import { useConditionText } from './condition-text';
import { FormatEditor } from './format-editor';
import { RowMenuTrigger } from './row-menu-trigger';
import type { Condition, CustomFormat, RulesView } from './rules-schemas';

const COLUMNS: TableColumn[] = [{ min: 200 }, { width: 64 }];
const MAX_CHIPS = 4;

const CHIP_INK = {
  required: 'text',
  optional: 'textMuted',
  excluded: 'dangerHover',
} as const;

export function FormatsView({
  rules,
  onSaved,
}: Readonly<{ rules: RulesView; onSaved: () => Promise<void> }>) {
  const t = useT();
  const confirm = useConfirm();
  const acquisition = useAcquisitionApi();
  const [editing, setEditing] = useState<CustomFormat | null>(null);
  const action = useAsyncAction();
  const taken = rules.formats.map((format) => format.id);

  const blank = () => ({ id: '', name: '', conditions: [blankCondition('releaseTitle')] });

  const duplicate = (format: CustomFormat) =>
    setEditing({
      id: '',
      name: t('acq.formatCopyName', { name: format.name }),
      conditions: format.conditions.map((condition) => ({ ...condition })),
    });

  const remove = async (format: CustomFormat) => {
    const yes = await confirm({
      title: t('acq.formatDeleteTitle', { name: format.name }),
      message: t('acq.formatDeleteHint'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!yes) return;
    await action.run(
      async () => {
        await acquisition.deleteFormat(format.id);
        await onSaved();
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );
  };

  return (
    <Box gap={16}>
      <Row justify="flex-end">
        <Button
          size="sm"
          icon="plus"
          label={t('acq.formatNew')}
          onPress={() => setEditing(blank())}
        />
      </Row>

      {action.error ? (
        <Callout.Root tone="danger">
          <Callout.Title>{action.error}</Callout.Title>
        </Callout.Root>
      ) : null}

      {rules.formats.length === 0 ? (
        <Surface radius="xl" pad="lg">
          <EmptyState.Root icon="flask">
            <EmptyState.Title>{t('acq.formatsEmpty')}</EmptyState.Title>
            <EmptyState.Hint>{t('acq.formatsEmptyHint')}</EmptyState.Hint>
          </EmptyState.Root>
        </Surface>
      ) : (
        <Table.Root columns={COLUMNS} label={t('acq.tabFormats')}>
          <Table.Header>
            <Table.Column>{t('acq.colFormat')}</Table.Column>
            <Table.Cell />
          </Table.Header>
          {rules.formats.map((format) => (
            <FormatRow
              key={format.id}
              format={format}
              busy={action.busy}
              onEdit={() => setEditing(format)}
              onDuplicate={() => duplicate(format)}
              onRemove={() => void remove(format)}
            />
          ))}
        </Table.Root>
      )}

      {editing ? (
        <FormatEditor
          format={editing}
          taken={taken}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      ) : null}
    </Box>
  );
}

function FormatRow({
  format,
  busy,
  onEdit,
  onDuplicate,
  onRemove,
}: Readonly<{
  format: CustomFormat;
  busy: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}>) {
  const t = useT();
  return (
    <Table.Row onPress={onEdit}>
      <Table.Cell>
        <Box minW={0} gap={4}>
          <Text variant="meta" lines={1}>
            {format.name}
          </Text>
          <ConditionChips conditions={format.conditions} />
        </Box>
      </Table.Cell>
      <Table.Cell>
        <Menu.Root label={t('acq.formatActionsOf', { name: format.name })} align="end">
          <RowMenuTrigger label={t('acq.formatActionsOf', { name: format.name })} />
          <Menu.Item icon="edit" onSelect={onEdit}>
            {t('acq.formatEdit')}
          </Menu.Item>
          <Menu.Item icon="copy" onSelect={onDuplicate}>
            {t('acq.formatDuplicate')}
          </Menu.Item>
          <Menu.Separator />
          <Menu.Item icon="trash" tone="danger" disabled={busy} onSelect={onRemove}>
            {t('common.delete')}
          </Menu.Item>
        </Menu.Root>
      </Table.Cell>
    </Table.Row>
  );
}

function ConditionChips({ conditions }: Readonly<{ conditions: readonly Condition[] }>) {
  const t = useT();
  const conditionText = useConditionText();
  const shown = conditions.slice(0, MAX_CHIPS);
  const rest = conditions.length - shown.length;
  return (
    <Row wrap gapX={6} gapY={4}>
      {shown.map((condition) => {
        const line = conditionText(condition);
        return (
          <Box key={line} radius="pill" bg="tint/8" px={8} py={1} maxW={260}>
            <Text variant="meta" color={CHIP_INK[modeOf(condition)]} lines={1}>
              {line}
            </Text>
          </Box>
        );
      })}
      {rest > 0 ? (
        <Text variant="meta" color="textDim">
          {t('acq.conditionMore', { count: rest })}
        </Text>
      ) : null}
    </Row>
  );
}
