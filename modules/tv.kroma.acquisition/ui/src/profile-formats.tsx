import { Table, type TableColumn, useT } from '@kromatv/module-sdk';
import { Box, Callout, EmptyState, NumberField, Text } from '@kromatv/ui/kit';
import { bestPositiveScore } from './preferred-languages';
import { PreferredLanguagesBox } from './preferred-languages-box';
import { setFormatScore } from './profile-draft';
import { ProfileThresholds } from './profile-thresholds';
import { RankingPreview } from './ranking-preview';
import type { CustomFormat, QualityProfile } from './rules-schemas';

const COLUMNS: TableColumn[] = [{ min: 160 }, { width: 150 }];

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
  const sorted = [...formats].sort(
    (a, b) => (profile.formatScores[b.id] ?? 0) - (profile.formatScores[a.id] ?? 0),
  );
  return (
    <Box gap={16}>
      <ProfileThresholds profile={profile} onChange={onChange} />
      <UpgradeReachWarning profile={profile} />
      <PreferredLanguagesBox profile={profile} formats={formats} onChange={onChange} />
      <RankingPreview profile={profile} />

      <Box gap={8}>
        <Text variant="meta" color="textDim">
          {t('acq.formatScoresHint')}
        </Text>
        <Table.Root columns={COLUMNS} label={t('acq.formatScores')}>
          <Table.Header>
            <Table.Column>{t('acq.colFormat')}</Table.Column>
            <Table.Column>{t('requests.colScore')}</Table.Column>
          </Table.Header>
          {sorted.map((format) => (
            <ScoreRow
              key={format.id}
              format={format}
              score={profile.formatScores[format.id] ?? 0}
              onPick={(score) => onChange(setFormatScore(profile, format.id, score))}
            />
          ))}
        </Table.Root>
      </Box>
    </Box>
  );
}

function ScoreRow({
  format,
  score,
  onPick,
}: Readonly<{ format: CustomFormat; score: number; onPick: (next: number) => void }>) {
  const t = useT();
  return (
    <Table.Row>
      <Table.Cell>
        <Text variant="meta" color={scoreInk(score)} lines={1}>
          {format.name}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <NumberField
          size="sm"
          step={50}
          label={t('acq.scoreOf', { name: format.name })}
          value={score}
          onValueChange={onPick}
        />
      </Table.Cell>
    </Table.Row>
  );
}

function scoreInk(score: number): 'text' | 'textDim' | 'dangerHover' {
  if (score === 0) return 'textDim';
  return score < 0 ? 'dangerHover' : 'text';
}

function UpgradeReachWarning({ profile }: Readonly<{ profile: QualityProfile }>) {
  const t = useT();
  const best = bestPositiveScore(profile);
  if (best === 0 || profile.upgradeUntilScore >= best) return null;
  return (
    <Callout.Root tone="accent" icon="alert-triangle">
      <Callout.Title>{t('acq.upgradeReachTitle')}</Callout.Title>
      <Callout.Detail>
        {t('acq.upgradeReachHint', { have: profile.upgradeUntilScore, need: best })}
      </Callout.Detail>
    </Callout.Root>
  );
}
