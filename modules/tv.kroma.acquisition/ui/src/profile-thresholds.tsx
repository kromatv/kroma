import { useT } from '@kromatv/module-sdk';
import { Box, Hint, NumberField, Row, Text } from '@kromatv/ui/kit';
import type { QualityProfile } from './rules-schemas';

const FIELD_W = 170;

export function ProfileThresholds({
  profile,
  onChange,
}: Readonly<{ profile: QualityProfile; onChange: (next: QualityProfile) => void }>) {
  const t = useT();
  return (
    <Row wrap gap={12} align="flex-start">
      <Threshold
        label={t('acq.minFormatScore')}
        hint={t('acq.minFormatScoreHint')}
        step={50}
        value={profile.minFormatScore}
        onPick={(minFormatScore) => onChange({ ...profile, minFormatScore })}
      />
      <Threshold
        label={t('acq.upgradeUntilScore')}
        hint={t('acq.upgradeUntilScoreHint')}
        step={50}
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
    </Row>
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
    <Box w={FIELD_W} gap={4}>
      <Text variant="meta" color="textMuted">
        {label}
      </Text>
      <NumberField
        size="sm"
        label={label}
        min={min}
        step={step}
        value={value}
        onValueChange={onPick}
      />
      <Hint text={hint} size={12} />
    </Box>
  );
}
