import { Table, type TableColumn, useFormat, useT } from '@kromatv/module-sdk';
import { Field, Section, Text } from '@kromatv/ui/kit';
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

const COLUMNS: TableColumn[] = [{}, { width: 96 }, { width: 96 }, { width: 96 }];

const FIELD_LABEL: Record<SizeField, string> = {
  min: 'acq.sizeMin',
  preferred: 'acq.sizePreferred',
  max: 'acq.sizeMax',
};

export function SizeTableView({
  table,
  title,
  qualities,
  draft,
  bad,
  onCell,
}: Readonly<{
  table: SizeTable;
  title: string;
  qualities: readonly QualityId[];
  draft: SizesDraft;
  bad: string | null;
  onCell: (key: string, value: string) => void;
}>) {
  const t = useT();
  return (
    <Section.Root gap={12}>
      <Section.Header>
        <Section.Title>{title}</Section.Title>
        <Section.Actions>
          <Text variant="meta" color="textDim">
            {t('acq.sizesUnit')}
          </Text>
        </Section.Actions>
      </Section.Header>
      {qualityGroups(qualities).map((group) => (
        <Table.Root
          key={group.label ?? 'other'}
          columns={COLUMNS}
          label={`${title} ${group.label ?? t('acq.sizesOther')}`}
        >
          <Table.Header>
            <Table.Column>{group.label ?? t('acq.sizesOther')}</Table.Column>
            {SIZE_FIELDS.map((field) => (
              <Table.Column key={field}>{t(FIELD_LABEL[field])}</Table.Column>
            ))}
          </Table.Header>
          {group.qualities.map((quality) => (
            <SizeRow
              key={quality}
              table={table}
              quality={quality}
              draft={draft}
              bad={bad}
              onCell={onCell}
            />
          ))}
        </Table.Root>
      ))}
    </Section.Root>
  );
}

function SizeRow({
  table,
  quality,
  draft,
  bad,
  onCell,
}: Readonly<{
  table: SizeTable;
  quality: QualityId;
  draft: SizesDraft;
  bad: string | null;
  onCell: (key: string, value: string) => void;
}>) {
  const t = useT();
  const fmt = useFormat();
  const label = useQualityLabel();
  const ceiling = limitBytes(draft, table, quality);
  const minutes = table === 'movie' ? draft.movieRuntime : draft.episodeRuntime;
  return (
    <Table.Row>
      <Table.Cell gap={2} minW={0}>
        <Text variant="meta" lines={1}>
          {label(quality)}
        </Text>
        {ceiling === null ? null : (
          <Text variant="meta" color="textDim" lines={1}>
            {t('acq.sizeCeiling', { size: fmt.bytes(ceiling), minutes })}
          </Text>
        )}
      </Table.Cell>
      {SIZE_FIELDS.map((field) => (
        <SizeCell
          key={field}
          table={table}
          quality={quality}
          field={field}
          name={label(quality)}
          draft={draft}
          bad={bad}
          onCell={onCell}
        />
      ))}
    </Table.Row>
  );
}

function SizeCell({
  table,
  quality,
  field,
  name,
  draft,
  bad,
  onCell,
}: Readonly<{
  table: SizeTable;
  quality: QualityId;
  field: SizeField;
  name: string;
  draft: SizesDraft;
  bad: string | null;
  onCell: (key: string, value: string) => void;
}>) {
  const t = useT();
  const key = cellKey(table, quality, field);
  return (
    <Table.Cell>
      <Field.Root
        label={`${name} ${t(FIELD_LABEL[field])}`}
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
