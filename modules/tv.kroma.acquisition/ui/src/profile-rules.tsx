import { useT } from '@kromatv/module-sdk';
import { Box, Field, ListRow, NumberField, Row, Switch, Text } from '@kromatv/ui/kit';
import { termsOf, termsText } from './profile-draft';
import type { QualityProfile } from './rules-schemas';

const NUMBER_W = 128;

export function ProfileRules({
  profile,
  onChange,
}: Readonly<{ profile: QualityProfile; onChange: (next: QualityProfile) => void }>) {
  const t = useT();
  return (
    <Box gap={20}>
      <ListRow.Group size="sm">
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
        <Threshold
          label={t('acq.upgradeUntilScore')}
          hint={t('acq.upgradeUntilScoreHint')}
          step={50}
          value={profile.upgradeUntilScore}
          onPick={(upgradeUntilScore) => onChange({ ...profile, upgradeUntilScore })}
        />
        <Threshold
          label={t('acq.minFormatScore')}
          hint={t('acq.minFormatScoreHint')}
          step={50}
          value={profile.minFormatScore}
          onPick={(minFormatScore) => onChange({ ...profile, minFormatScore })}
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

      <Box gap={8}>
        <Text variant="meta" color="textDim">
          {t('acq.termsHint')}
        </Text>
        <Row wrap gap={16} align="flex-start">
          <Box flex minW={220}>
            <Field.Root
              label={t('acq.mustContain')}
              size="sm"
              value={termsText(profile.mustContain)}
              onValueChange={(text) => onChange({ ...profile, mustContain: termsOf(text) })}
            >
              <Field.Textarea rows={3} placeholder="MULTi" />
            </Field.Root>
          </Box>
          <Box flex minW={220}>
            <Field.Root
              label={t('acq.mustNotContain')}
              size="sm"
              value={termsText(profile.mustNotContain)}
              onValueChange={(text) => onChange({ ...profile, mustNotContain: termsOf(text) })}
            >
              <Field.Textarea rows={3} placeholder="CAM" />
            </Field.Root>
          </Box>
        </Row>
      </Box>
    </Box>
  );
}

function Threshold({
  label,
  hint,
  min,
  step,
  value,
  onPick,
}: Readonly<{
  label: string;
  hint: string;
  min?: number;
  step?: number;
  value: number;
  onPick: (next: number) => void;
}>) {
  return (
    <ListRow.Root size="sm" ground="surface" chevron={false}>
      <ListRow.Label>{label}</ListRow.Label>
      <ListRow.Hint>{hint}</ListRow.Hint>
      <ListRow.Trailing>
        <Box w={NUMBER_W}>
          <NumberField
            size="sm"
            label={label}
            min={min}
            step={step}
            value={value}
            onValueChange={onPick}
          />
        </Box>
      </ListRow.Trailing>
    </ListRow.Root>
  );
}
