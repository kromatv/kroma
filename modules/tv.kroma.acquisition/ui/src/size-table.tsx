import { Table, type TableColumn, useFormat, useT } from '@kromatv/module-sdk';
import { Box, Disclosure, Field, Row, Text, useBreakpoint } from '@kromatv/ui/kit';
import { qualityGroups } from './quality-groups';
import type { QualityId } from './rules-schemas';
import {
  cellKey,
  limitBytes,
  SIZE_FIELDS,
  type SizeField,
  type SizesDraft,
  type SizeTable,
} from './sizes-draft';
import { useQualityLabel } from './use-quality-label';

const WIDE_COLUMNS: TableColumn[] = [{ min: 160 }, { width: 110 }, { width: 110 }, { width: 110 }];
const NARROW_COLUMNS: TableColumn[] = [{ min: 120 }];

const FIELD_LABEL: Record<SizeField, string> = {
  min: 'acq.sizeMin',
  preferred: 'acq.sizePreferred',
  max: 'acq.sizeMax',
};

export function SizeTableView({
  table,
  qualities,
  draft,
  bad,
  onCell,
}: Readonly<{
  table: SizeTable;
  qualities: readonly QualityId[];
  draft: SizesDraft;
  bad: string | null;
  onCell: (key: string, value: string) => void;
}>) {
  const t = useT();
  const narrow = useBreakpoint() === 'base';
  const groups = qualityGroups(qualities);
  return (
    <Box>
      <Text variant="meta" color="textDim">
        {t('acq.sizesUnit')}
      </Text>
      {groups.map((group, at) => (
        <Disclosure.Root key={group.label ?? 'other'} defaultOpen={at === 0}>
          <Disclosure.Trigger>{group.label ?? t('acq.sizesOther')}</Disclosure.Trigger>
          <Disclosure.Panel>
            <Table.Root
              columns={narrow ? NARROW_COLUMNS : WIDE_COLUMNS}
              label={`${t('acq.tabSizes')} ${group.label ?? t('acq.sizesOther')}`}
            >
              {narrow ? null : (
                <Table.Header>
                  <Table.Column>{t('acq.colQuality')}</Table.Column>
                  {SIZE_FIELDS.map((field) => (
                    <Table.Column key={field}>{t(FIELD_LABEL[field])}</Table.Column>
                  ))}
                </Table.Header>
              )}
              {group.qualities.map((quality) => (
                <SizeRow
                  key={quality}
                  table={table}
                  quality={quality}
                  narrow={narrow}
                  draft={draft}
                  bad={bad}
                  onCell={onCell}
                />
              ))}
            </Table.Root>
          </Disclosure.Panel>
        </Disclosure.Root>
      ))}
    </Box>
  );
}

function SizeRow({
  table,
  quality,
  narrow,
  draft,
  bad,
  onCell,
}: Readonly<{
  table: SizeTable;
  quality: QualityId;
  narrow: boolean;
  draft: SizesDraft;
  bad: string | null;
  onCell: (key: string, value: string) => void;
}>) {
  const t = useT();
  const fmt = useFormat();
  const label = useQualityLabel();
  const ceiling = limitBytes(draft, table, quality);
  const minutes = table === 'movie' ? draft.movieRuntime : draft.episodeRuntime;
  const name = label(quality);
  const cells = SIZE_FIELDS.map((field) => (
    <SizeCell
      key={field}
      table={table}
      quality={quality}
      field={field}
      name={name}
      narrow={narrow}
      draft={draft}
      bad={bad}
      onCell={onCell}
    />
  ));
  return (
    <Table.Row>
      <Table.Cell gap={6} minW={0}>
        <Box gap={2}>
          <Text variant="meta" lines={1}>
            {name}
          </Text>
          {ceiling === null ? null : (
            <Text variant="meta" color="textDim" lines={1}>
              {t('acq.sizeCeiling', { size: fmt.bytes(ceiling), minutes })}
            </Text>
          )}
        </Box>
        {narrow ? (
          <Row gap={8} align="flex-end">
            {cells}
          </Row>
        ) : null}
      </Table.Cell>
      {narrow ? null : cells}
    </Table.Row>
  );
}

function SizeCell({
  table,
  quality,
  field,
  name,
  narrow,
  draft,
  bad,
  onCell,
}: Readonly<{
  table: SizeTable;
  quality: QualityId;
  field: SizeField;
  name: string;
  narrow: boolean;
  draft: SizesDraft;
  bad: string | null;
  onCell: (key: string, value: string) => void;
}>) {
  const t = useT();
  const key = cellKey(table, quality, field);
  const entry = (
    <Field.Root
      label={`${name} ${t(FIELD_LABEL[field])}`}
      hideLabel={!narrow}
      size="sm"
      invalid={bad === key}
      value={draft.cells[key] ?? ''}
      onValueChange={(next) => onCell(key, next)}
    >
      <Field.Input type="number" placeholder="0" />
    </Field.Root>
  );
  if (narrow) return <Box flex>{entry}</Box>;
  return <Table.Cell>{entry}</Table.Cell>;
}
