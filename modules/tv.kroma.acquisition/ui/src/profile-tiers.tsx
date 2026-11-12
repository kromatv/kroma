import { Table, type TableColumn, useT } from '@kromatv/module-sdk';
import { Badge, Box, Checkbox, Row, Select, Text } from '@kromatv/ui/kit';
import { allowedQualities, moveTier, setTierAllowed } from './profile-draft';
import type { QualityId, QualityProfile, QualityTier } from './rules-schemas';
import { useQualityLabel } from './use-quality-label';

const COLUMNS: TableColumn[] = [{ width: 52 }, { min: 180 }, { width: 64 }, { width: 64 }];

export function ProfileTiers({
  profile,
  onChange,
}: Readonly<{ profile: QualityProfile; onChange: (next: QualityProfile) => void }>) {
  const t = useT();
  const label = useQualityLabel();
  const allowed = allowedQualities(profile);
  const rows = profile.tiers.map((tier, index) => ({ tier, index }));
  const accepted = rows.filter((row) => row.tier.allowed);
  const refused = rows.filter((row) => !row.tier.allowed);

  const move = (index: number, delta: number) => onChange(moveTier(profile, index, delta));

  return (
    <Box gap={14}>
      <Row wrap between gap={12} align="flex-end">
        <Text variant="meta" color="textDim" flex minW={240}>
          {t('acq.ladderHint')}
        </Text>
        <Box w={220}>
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

      <TierGroup
        title={t('acq.tiersAccepted')}
        rows={accepted}
        count={profile.tiers.length}
        cutoff={profile.cutoff}
        onMove={move}
        onAllowed={(index, next) => onChange(setTierAllowed(profile, index, next))}
      />
      <TierGroup
        title={t('acq.tiersRefused')}
        rows={refused}
        count={profile.tiers.length}
        cutoff={profile.cutoff}
        onMove={move}
        onAllowed={(index, next) => onChange(setTierAllowed(profile, index, next))}
      />
    </Box>
  );
}

interface TierRowData {
  tier: QualityTier;
  index: number;
}

function TierGroup({
  title,
  rows,
  count,
  cutoff,
  onMove,
  onAllowed,
}: Readonly<{
  title: string;
  rows: readonly TierRowData[];
  count: number;
  cutoff: QualityId;
  onMove: (index: number, delta: number) => void;
  onAllowed: (index: number, next: boolean) => void;
}>) {
  const t = useT();
  if (rows.length === 0) return null;
  return (
    <Box gap={6}>
      <Text variant="overline" color="textMuted">
        {title}
      </Text>
      <Table.Root columns={COLUMNS} label={`${t('acq.ladder')} ${title}`}>
        {rows.map(({ tier, index }) => (
          <TierRow
            key={tier.qualities.join('+') || `tier-${index}`}
            tier={tier}
            index={index}
            last={index === count - 1}
            cutoff={cutoff}
            onMove={onMove}
            onAllowed={onAllowed}
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
  onMove: (index: number, delta: number) => void;
  onAllowed: (index: number, next: boolean) => void;
}>) {
  const t = useT();
  const label = useQualityLabel();
  const names = tier.qualities.map(label).join(' · ');
  return (
    <Table.Row>
      <Table.Cell>
        <Checkbox
          checked={tier.allowed}
          onCheckedChange={(next) => onAllowed(index, next)}
          label={t('acq.tierAllowedOf', { name: names })}
        />
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
          tone={index === 0 ? 'textDim' : 'text'}
          icon="arrow-up"
          label={t('acq.tierUpOf', { name: names })}
          onPress={() => onMove(index, -1)}
        />
      </Table.Cell>
      <Table.Cell>
        <Table.Action
          tone={last ? 'textDim' : 'text'}
          icon="arrow-down"
          label={t('acq.tierDownOf', { name: names })}
          onPress={() => onMove(index, 1)}
        />
      </Table.Cell>
    </Table.Row>
  );
}
