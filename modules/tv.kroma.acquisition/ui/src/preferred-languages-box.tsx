import { TABULAR, useT } from '@kromatv/module-sdk';
import { Box, Button, Callout, Row, Surface, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { type DubScore, dubScores, withDubScores } from './preferred-languages';
import type { CustomFormat, QualityProfile } from './rules-schemas';

export function PreferredLanguagesBox({
  profile,
  formats,
  onChange,
}: Readonly<{
  profile: QualityProfile;
  formats: readonly CustomFormat[];
  onChange: (next: QualityProfile) => void;
}>) {
  const t = useT();
  const [preview, setPreview] = useState<DubScore[] | null>(null);
  if (formats.length === 0) return null;
  return (
    <Surface radius="lg" pad="sm" tone="raised">
      <Box gap={10}>
        <Row wrap between gap={12} align="center">
          <Box flex minW={220}>
            <Text variant="label">{t('acq.preferredLanguages')}</Text>
            <Text variant="meta" color="textDim">
              {t('acq.preferredLanguagesHint')}
            </Text>
          </Box>
          <Button
            size="sm"
            variant="glass"
            icon="wand"
            label={t(preview ? 'acq.preferredRecompute' : 'acq.preferredPropose')}
            onPress={() => setPreview(dubScores(profile, formats))}
          />
        </Row>
        {preview ? <Proposal profile={profile} proposal={preview} onChange={onChange} /> : null}
      </Box>
    </Surface>
  );
}

function Proposal({
  profile,
  proposal,
  onChange,
}: Readonly<{
  profile: QualityProfile;
  proposal: readonly DubScore[];
  onChange: (next: QualityProfile) => void;
}>) {
  const t = useT();
  if (proposal.length === 0) {
    return (
      <Callout.Root tone="neutral">
        <Callout.Title>{t('acq.preferredNoFormats')}</Callout.Title>
        <Callout.Detail>{t('acq.preferredNoFormatsHint')}</Callout.Detail>
      </Callout.Root>
    );
  }
  return (
    <Box gap={8}>
      <Box gap={4}>
        {proposal.map((entry) => (
          <Row key={entry.dub} between gap={12}>
            <Text variant="meta" color="textDim" lines={1} minW={0}>
              {entry.format.name}
            </Text>
            <Text variant="meta" color="text" style={TABULAR}>
              {t('acq.preferredFromTo', {
                from: profile.formatScores[entry.format.id] ?? 0,
                to: entry.score,
              })}
            </Text>
          </Row>
        ))}
      </Box>
      <Row>
        <Button
          size="sm"
          icon="check"
          label={t('acq.preferredApply')}
          onPress={() => onChange(withDubScores(profile, proposal))}
        />
      </Row>
    </Box>
  );
}
