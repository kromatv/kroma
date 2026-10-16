import { useT } from '@kromatv/module-sdk';
import {
  Box,
  Icon,
  IconButton,
  Row,
  Section,
  Select,
  Surface,
  Switch,
  Text,
} from '@kromatv/ui/kit';
import { allowedQualities, moveTier, setTierAllowed } from './profile-draft';
import type { QualityId, QualityProfile, QualityTier } from './rules-schemas';

export function ProfileTiers({
  profile,
  onChange,
}: Readonly<{ profile: QualityProfile; onChange: (next: QualityProfile) => void }>) {
  const t = useT();
  const allowed = allowedQualities(profile);
  return (
    <Section.Root gap={12}>
      <Section.Header>
        <Section.Title>{t('acq.ladder')}</Section.Title>
        <Section.Actions>
          <Box w={210}>
            <Row gap={8} align="center">
              <Text variant="meta" color="textMuted">
                {t('acq.cutoff')}
              </Text>
              <Box flex>
                <Select.Root
                  label={t('acq.cutoff')}
                  value={profile.cutoff}
                  onValueChange={(next) =>
                    onChange({ ...profile, cutoff: cutoffOf(allowed, next) })
                  }
                >
                  <Select.Trigger size="sm" block />
                  {allowed.map((quality) => (
                    <Select.Item key={quality} value={quality} label={quality} />
                  ))}
                </Select.Root>
              </Box>
            </Row>
          </Box>
        </Section.Actions>
      </Section.Header>

      <Text variant="meta" color="textDim">
        {t('acq.ladderHint')}
      </Text>

      <Box gap={8}>
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
      </Box>
    </Section.Root>
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
  const holdsCutoff = tier.qualities.includes(cutoff);
  return (
    <Surface radius="lg" pad="sm" tone={tier.allowed ? 'raised' : 'outline'}>
      <Row wrap gap={12} align="center">
        <Switch label={t('acq.tierAllowed')} checked={tier.allowed} onCheckedChange={onAllowed} />
        <Box flex minW={160}>
          <Row wrap gapX={8} gapY={4} align="center">
            {tier.qualities.map((quality) => (
              <Text
                key={quality}
                variant="meta"
                color={tier.allowed ? 'text' : 'textDim'}
                lines={1}
              >
                {quality}
              </Text>
            ))}
          </Row>
          {tier.name ? (
            <Text variant="meta" color="textDim">
              {tier.name}
            </Text>
          ) : null}
        </Box>
        {holdsCutoff ? (
          <Text variant="meta" color="accentText">
            {t('acq.cutoffHere')}
          </Text>
        ) : null}
        <Row gap={4} shrink={0}>
          <IconButton
            control="sm"
            radius="sm"
            variant="ghost"
            label={t('acq.tierUp')}
            disabled={index === 0}
            onPress={() => onMove(-1)}
          >
            <Icon name="arrow-up" size={16} color="textDim" thickness={2.2} />
          </IconButton>
          <IconButton
            control="sm"
            radius="sm"
            variant="ghost"
            label={t('acq.tierDown')}
            disabled={last}
            onPress={() => onMove(1)}
          >
            <Icon name="arrow-down" size={16} color="textDim" thickness={2.2} />
          </IconButton>
        </Row>
      </Row>
    </Surface>
  );
}
