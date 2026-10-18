import { apiErrorText } from '@kromatv/client';
import { Table, type TableColumn, useAsyncAction, useT } from '@kromatv/module-sdk';
import {
  Box,
  Button,
  Callout,
  confirm,
  EmptyState,
  Row,
  Section,
  Surface,
  Text,
} from '@kromatv/ui/kit';
import { useState } from 'react';
import { useAcquisitionApi } from './api';
import { blankCondition } from './condition-draft';
import { FormatEditor } from './format-editor';
import type { ConditionType, CustomFormat, RulesView } from './rules-schemas';
import { RulesTestBox } from './rules-test-box';

const COLUMNS: TableColumn[] = [{}, { width: 44 }, { width: 44 }];

function testedTypes(format: CustomFormat): ConditionType[] {
  return [...new Set(format.conditions.map((condition) => condition.type))];
}

export function FormatsView({
  rules,
  onSaved,
}: Readonly<{ rules: RulesView; onSaved: () => Promise<void> }>) {
  const t = useT();
  const acquisition = useAcquisitionApi();
  const [editing, setEditing] = useState<CustomFormat | null>(null);
  const action = useAsyncAction();
  const taken = rules.formats.map((format) => format.id);

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
    <Box gap={24}>
      <Section.Root>
        <Section.Header>
          <Section.Title>{t('acq.tabFormats')}</Section.Title>
          <Section.Actions>
            <Button
              size="sm"
              icon="plus"
              label={t('acq.formatNew')}
              onPress={() =>
                setEditing({ id: '', name: '', conditions: [blankCondition('releaseTitle')] })
              }
            />
          </Section.Actions>
        </Section.Header>

        <Text variant="meta" color="textDim">
          {t('acq.formatsHint')}
        </Text>

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
              <Table.Cell />
            </Table.Header>
            {rules.formats.map((format) => (
              <Table.Row key={format.id} onPress={() => setEditing(format)}>
                <Table.Cell>
                  <Box minW={0}>
                    <Text variant="meta" lines={1}>
                      {format.name}
                    </Text>
                    <Row wrap gapX={10} mt={2}>
                      <Text variant="meta" color="textDim">
                        {t('acq.conditionCount', { count: format.conditions.length })}
                      </Text>
                      <Text variant="meta" color="textDim" lines={1}>
                        {testedTypes(format)
                          .map((type) => t(`acq.condition.${type}`))
                          .join(' · ')}
                      </Text>
                    </Row>
                  </Box>
                </Table.Cell>
                <Table.Cell>
                  <Table.Action
                    tone="accentText"
                    icon="edit"
                    label={t('acq.formatEdit')}
                    onPress={() => setEditing(format)}
                  />
                </Table.Cell>
                <Table.Cell>
                  <Table.Action
                    tone="dangerHover"
                    icon="trash"
                    label={t('common.delete')}
                    disabled={action.busy}
                    onPress={() => void remove(format)}
                  />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Root>
        )}
      </Section.Root>

      <RulesTestBox />

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
