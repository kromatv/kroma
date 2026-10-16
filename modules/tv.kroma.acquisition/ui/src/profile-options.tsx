import { useT } from '@kromatv/module-sdk';
import { Box, Field, ListRow, NumberField, Row, Section, Switch, Text } from '@kromatv/ui/kit';
import { setFormatScore, termsOf, termsText } from './profile-draft';
import type { CustomFormat, QualityProfile } from './rules-schemas';

const NUMBER_W = 128;

export function ProfileOptions({
  profile,
  formats,
  onChange,
}: Readonly<{
  profile: QualityProfile;
  formats: readonly CustomFormat[];
  onChange: (next: QualityProfile) => void;
}>) {
  const t = useT();
  return (
    <Box gap={24}>
      <Section.Root gap={12}>
        <Section.Header>
          <Section.Title>{t('acq.formatScores')}</Section.Title>
        </Section.Header>
        <Text variant="meta" color="textDim">
          {t('acq.formatScoresHint')}
        </Text>
        {formats.length === 0 ? (
          <Text variant="meta" color="textDim">
            {t('acq.formatsEmpty')}
          </Text>
        ) : (
          <ListRow.Group size="sm">
            {formats.map((format) => (
              <ListRow.Root key={format.id} size="sm" ground="surface" chevron={false}>
                <ListRow.Label>{format.name}</ListRow.Label>
                <ListRow.Trailing>
                  <Box w={NUMBER_W}>
                    <NumberField
                      size="sm"
                      label={format.name}
                      value={profile.formatScores[format.id] ?? 0}
                      onValueChange={(score) => onChange(setFormatScore(profile, format.id, score))}
                    />
                  </Box>
                </ListRow.Trailing>
              </ListRow.Root>
            ))}
          </ListRow.Group>
        )}
      </Section.Root>

      <Section.Root gap={12}>
        <Section.Header>
          <Section.Title>{t('acq.thresholds')}</Section.Title>
        </Section.Header>
        <ListRow.Group size="sm">
          <Threshold
            label={t('acq.minFormatScore')}
            hint={t('acq.minFormatScoreHint')}
            value={profile.minFormatScore}
            onPick={(minFormatScore) => onChange({ ...profile, minFormatScore })}
          />
          <Threshold
            label={t('acq.upgradeUntilScore')}
            hint={t('acq.upgradeUntilScoreHint')}
            value={profile.upgradeUntilScore}
            onPick={(upgradeUntilScore) => onChange({ ...profile, upgradeUntilScore })}
          />
          <Threshold
            label={t('acq.minUpgradeIncrement')}
            hint={t('acq.minUpgradeIncrementHint')}
            min={1}
            value={profile.minUpgradeIncrement}
            onPick={(minUpgradeIncrement) => onChange({ ...profile, minUpgradeIncrement })}
          />
          <Threshold
            label={t('acq.minSeeders')}
            hint={t('acq.minSeedersHint')}
            min={0}
            value={profile.minSeeders}
            onPick={(minSeeders) => onChange({ ...profile, minSeeders })}
          />
          <ListRow.Root size="sm" ground="surface" chevron={false}>
            <ListRow.Label>{t('acq.upgradesAllowed')}</ListRow.Label>
            <ListRow.Hint>{t('acq.upgradesAllowedHint')}</ListRow.Hint>
            <ListRow.Trailing>
              <Switch
                label={t('acq.upgradesAllowed')}
                checked={profile.upgradesAllowed}
                onCheckedChange={(upgradesAllowed) => onChange({ ...profile, upgradesAllowed })}
              />
            </ListRow.Trailing>
          </ListRow.Root>
          <ListRow.Root size="sm" ground="surface" chevron={false}>
            <ListRow.Label>{t('acq.addBeside')}</ListRow.Label>
            <ListRow.Hint>{t('acq.addBesideHint')}</ListRow.Hint>
            <ListRow.Trailing>
              <Switch
                label={t('acq.addBeside')}
                checked={profile.addBeside}
                onCheckedChange={(addBeside) => onChange({ ...profile, addBeside })}
              />
            </ListRow.Trailing>
          </ListRow.Root>
        </ListRow.Group>
      </Section.Root>

      <Section.Root gap={12}>
        <Section.Header>
          <Section.Title>{t('acq.terms')}</Section.Title>
        </Section.Header>
        <Text variant="meta" color="textDim">
          {t('acq.termsHint')}
        </Text>
        <Row wrap gap={16} align="flex-start">
          <Box flex minW={220}>
            <Field.Root
              label={t('acq.mustContain')}
              value={termsText(profile.mustContain)}
              onValueChange={(text) => onChange({ ...profile, mustContain: termsOf(text) })}
            >
              <Field.Textarea rows={3} placeholder="MULTi" />
            </Field.Root>
          </Box>
          <Box flex minW={220}>
            <Field.Root
              label={t('acq.mustNotContain')}
              value={termsText(profile.mustNotContain)}
              onValueChange={(text) => onChange({ ...profile, mustNotContain: termsOf(text) })}
            >
              <Field.Textarea rows={3} placeholder="CAM" />
            </Field.Root>
          </Box>
        </Row>
      </Section.Root>
    </Box>
  );
}

function Threshold({
  label,
  hint,
  min,
  value,
  onPick,
}: Readonly<{
  label: string;
  hint: string;
  min?: number;
  value: number;
  onPick: (next: number) => void;
}>) {
  return (
    <ListRow.Root size="sm" ground="surface" chevron={false}>
      <ListRow.Label>{label}</ListRow.Label>
      <ListRow.Hint>{hint}</ListRow.Hint>
      <ListRow.Trailing>
        <Box w={NUMBER_W}>
          <NumberField size="sm" label={label} min={min} value={value} onValueChange={onPick} />
        </Box>
      </ListRow.Trailing>
    </ListRow.Root>
  );
}
