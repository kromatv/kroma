import { apiErrorText } from '@kromatv/client';
import { Table, type TableColumn, useAsyncAction, useT } from '@kromatv/module-sdk';
import { Box, Button, Callout, Field, Row, Section, Surface, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { useAcquisitionApi } from './api';
import type { QualityId, RulesView } from './rules-schemas';
import {
  badCell,
  cellKey,
  draftOfSizes,
  SIZE_FIELDS,
  type SizeField,
  type SizesDraft,
  type SizeTable,
  setCell,
  toSizes,
} from './sizes-draft';

const COLUMNS: TableColumn[] = [{}, { width: 104 }, { width: 104 }, { width: 104 }];

const FIELD_LABEL: Record<SizeField, string> = {
  min: 'acq.sizeMin',
  preferred: 'acq.sizePreferred',
  max: 'acq.sizeMax',
};

export function SizesView({
  rules,
  onSaved,
}: Readonly<{ rules: RulesView; onSaved: () => Promise<void> }>) {
  const t = useT();
  const acquisition = useAcquisitionApi();
  const [draft, setDraft] = useState<SizesDraft>(() => draftOfSizes(rules.sizes, rules.qualities));
  const action = useAsyncAction();
  const bad = badCell(draft, rules.qualities);
  const onCell = (key: string, value: string) => setDraft((d) => setCell(d, key, value));

  const save = () =>
    action.run(
      async () => {
        await acquisition.saveSizes(toSizes(draft, rules.qualities));
        await onSaved();
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  return (
    <Box gap={20}>
      <Text variant="meta" color="textDim">
        {t('acq.sizesHint')}
      </Text>

      {action.error ? (
        <Callout.Root tone="danger">
          <Callout.Title>{action.error}</Callout.Title>
        </Callout.Root>
      ) : null}

      <Surface radius="xl" pad="lg">
        <Row wrap gap={16} align="flex-end">
          <Box w={170}>
            <Field.Root
              label={t('acq.movieRuntime')}
              size="sm"
              invalid={bad === 'movieRuntime'}
              value={draft.movieRuntime}
              onValueChange={(next) => setDraft((d) => ({ ...d, movieRuntime: next }))}
            >
              <Field.Input type="number" />
            </Field.Root>
          </Box>
          <Box w={170}>
            <Field.Root
              label={t('acq.episodeRuntime')}
              size="sm"
              invalid={bad === 'episodeRuntime'}
              value={draft.episodeRuntime}
              onValueChange={(next) => setDraft((d) => ({ ...d, episodeRuntime: next }))}
            >
              <Field.Input type="number" />
            </Field.Root>
          </Box>
        </Row>
      </Surface>

      <SizeTableView
        table="movie"
        title={t('acq.sizesMovies')}
        rules={rules}
        draft={draft}
        bad={bad}
        onCell={onCell}
      />
      <SizeTableView
        table="episode"
        title={t('acq.sizesEpisodes')}
        rules={rules}
        draft={draft}
        bad={bad}
        onCell={onCell}
      />

      <Row wrap between gap={12} align="center">
        <Text variant="meta" color={bad ? 'dangerHover' : 'textDim'}>
          {bad ? t('acq.sizesBad') : t('acq.sizesUnit')}
        </Text>
        <Button
          size="sm"
          icon="check"
          label={t('common.save')}
          loading={action.busy}
          disabled={bad !== null}
          onPress={save}
        />
      </Row>
    </Box>
  );
}

function SizeTableView({
  table,
  title,
  rules,
  draft,
  bad,
  onCell,
}: Readonly<{
  table: SizeTable;
  title: string;
  rules: RulesView;
  draft: SizesDraft;
  bad: string | null;
  onCell: (key: string, value: string) => void;
}>) {
  const t = useT();
  return (
    <Section.Root>
      <Section.Header>
        <Section.Title>{title}</Section.Title>
      </Section.Header>
      <Table.Root columns={COLUMNS} label={title}>
        <Table.Header>
          <Table.Column>{t('acq.colQuality')}</Table.Column>
          {SIZE_FIELDS.map((field) => (
            <Table.Column key={field}>{t(FIELD_LABEL[field])}</Table.Column>
          ))}
        </Table.Header>
        {rules.qualities.map((quality) => (
          <Table.Row key={quality}>
            <Table.Cell>
              <Text variant="meta">{quality}</Text>
            </Table.Cell>
            {SIZE_FIELDS.map((field) => (
              <SizeCell
                key={field}
                table={table}
                quality={quality}
                field={field}
                draft={draft}
                bad={bad}
                onCell={onCell}
              />
            ))}
          </Table.Row>
        ))}
      </Table.Root>
    </Section.Root>
  );
}

function SizeCell({
  table,
  quality,
  field,
  draft,
  bad,
  onCell,
}: Readonly<{
  table: SizeTable;
  quality: QualityId;
  field: SizeField;
  draft: SizesDraft;
  bad: string | null;
  onCell: (key: string, value: string) => void;
}>) {
  const t = useT();
  const key = cellKey(table, quality, field);
  return (
    <Table.Cell>
      <Field.Root
        label={`${quality} ${t(FIELD_LABEL[field])}`}
        hideLabel
        size="sm"
        invalid={bad === key}
        value={draft.cells[key] ?? ''}
        onValueChange={(next) => onCell(key, next)}
      >
        <Field.Input type="number" placeholder="0" />
      </Field.Root>
    </Table.Cell>
  );
}
