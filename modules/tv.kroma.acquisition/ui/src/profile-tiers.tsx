import { Table, type TableColumn, useT } from '@kromatv/module-sdk';
import { Badge, Box, Checkbox, Row, Select, Text } from '@kromatv/ui/kit';
import { allowedQualities, moveTier, setTierAllowed } from './profile-draft';
import type { QualityId, QualityProfile, QualityTier } from './rules-schemas';
import { useQualityLabel } from './use-quality-label';

const COLUMNS: TableColumn[] = [{ width: 52 }, {}, { width: 44 }, { width: 44 }];

export function ProfileTiers({
  profile,
  onChange,
}: Readonly<{ profile: QualityProfile; onChange: (next: QualityProfile) => void }>) {
  const t = useT();
  const label = useQualityLabel();
  const allowed = allowedQualities(profile);
  return (
    <Box gap={12}>
      <Row wrap between gap={12} align="flex-end">
        <Text variant="meta" color="textDim" flex minW={240}>
          {t('acq.ladderHint')}
        </Text>
        <Row gap={8} align="center" shrink={0}>
          <Text variant="meta" color="textMuted">
            {t('acq.cutoff')}
          </Text>
          <Box w={190}>
            <Select.Root
              label={t('acq.cutoff')}
              value={profile.cutoff}
              onValueChange={(next) => onChange({ ...profile, cutoff: cutoffOf(allowed, next) })}
            >
              <Select.Trigger size="sm" block />
              {allowed.map((quality) => (
                <Select.Item key={quality} value={quality} label={label(quality)} />
              ))}
            </Select.Root>
          </Box>
        </Row>
      </Row>

      <Table.Root columns={COLUMNS} label={t('acq.ladder')}>
        <Table.Header>
          <Table.Cell />
          <Table.Column>{t('acq.colQuality')}</Table.Column>
          <Table.Cell />
          <Table.Cell />
        </Table.Header>
        {profile.tiers.map((tier, index) => (
          <TierRow
            key={tier.qualities.join('+') || `tier-${index}`}
            tier={tier}
            index={index}
            last={index === profile.tiers.length - 1}
            cutoff={profile.cutoff}
            onMove={(delta) => onChange(moveTier(profile, index, delta))}
            onAllowed={(next) => onChange(setTierAllowed(profile, index, next))}
          />
        ))}
      </Table.Root>
    </Box>
  );
}

function cutoffOf(allowed: readonly QualityId[], picked: string): QualityId {
  return allowed.find((quality) => quality === picked) ?? (allowed[0] as QualityId);
}

function TierRow({
  tier,
  index,
  last,
  cutoff,
  onMove,
  onAllowed,
}: Readonly<{
  tier: QualityTier;
  index: number;
  last: boolean;
  cutoff: QualityId;
  onMove: (delta: number) => void;
  onAllowed: (next: boolean) => void;
}>) {
  const t = useT();
  const label = useQualityLabel();
  const names = tier.qualities.map(label).join(' · ');
  return (
    <Table.Row>
      <Table.Cell>
        <Checkbox checked={tier.allowed} onCheckedChange={onAllowed} label={t('acq.tierAllowed')} />
      </Table.Cell>
      <Table.Cell>
        <Box minW={0} gap={2}>
          <Row wrap gapX={8} gapY={4} align="center">
            <Text variant="meta" color={tier.allowed ? 'text' : 'textDim'} lines={1} minW={0}>
              {names}
            </Text>
            {tier.qualities.includes(cutoff) ? (
              <Badge tone="warning">{t('acq.cutoffHere')}</Badge>
            ) : null}
          </Row>
          {tier.name ? (
            <Text variant="meta" color="textDim" lines={1}>
              {tier.name}
            </Text>
          ) : null}
        </Box>
      </Table.Cell>
      <Table.Cell>
        <Table.Action
          tone="textDim"
          icon="arrow-up"
          label={t('acq.tierUp')}
          disabled={index === 0}
          onPress={() => onMove(-1)}
        />
      </Table.Cell>
      <Table.Cell>
        <Table.Action
          tone="textDim"
          icon="arrow-down"
          label={t('acq.tierDown')}
          disabled={last}
          onPress={() => onMove(1)}
        />
      </Table.Cell>
    </Table.Row>
  );
}
