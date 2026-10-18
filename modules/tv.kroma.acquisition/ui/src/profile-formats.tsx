import { Table, type TableColumn, useT } from '@kromatv/module-sdk';
import { Box, EmptyState, NumberField, Text } from '@kromatv/ui/kit';
import { setFormatScore } from './profile-draft';
import type { CustomFormat, QualityProfile } from './rules-schemas';

const COLUMNS: TableColumn[] = [{}, { width: 136 }];

export function ProfileFormats({
  profile,
  formats,
  onChange,
}: Readonly<{
  profile: QualityProfile;
  formats: readonly CustomFormat[];
  onChange: (next: QualityProfile) => void;
}>) {
  const t = useT();
  if (formats.length === 0) {
    return (
      <EmptyState.Root icon="flask">
        <EmptyState.Title>{t('acq.formatsEmpty')}</EmptyState.Title>
        <EmptyState.Hint>{t('acq.formatsEmptyHint')}</EmptyState.Hint>
      </EmptyState.Root>
    );
  }
  return (
    <Box gap={12}>
      <Text variant="meta" color="textDim">
        {t('acq.formatScoresHint')}
      </Text>
      <Table.Root columns={COLUMNS} label={t('acq.formatScores')}>
        <Table.Header>
          <Table.Column>{t('acq.colFormat')}</Table.Column>
          <Table.Column>{t('requests.colScore')}</Table.Column>
        </Table.Header>
        {formats.map((format) => (
          <Table.Row key={format.id}>
            <Table.Cell>
              <Text variant="meta" lines={1}>
                {format.name}
              </Text>
            </Table.Cell>
            <Table.Cell>
              <NumberField
                size="sm"
                step={50}
                label={format.name}
                value={profile.formatScores[format.id] ?? 0}
                onValueChange={(score) => onChange(setFormatScore(profile, format.id, score))}
              />
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Root>
    </Box>
  );
}
