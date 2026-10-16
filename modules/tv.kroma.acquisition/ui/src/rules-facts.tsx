import { useFormat, useT } from '@kromatv/module-sdk';
import { Box, DataField, Row, Text } from '@kromatv/ui/kit';
import { factLabel } from './fact-labels';
import type { Facts } from './rules-schemas';

const FACT_W = 150;

export function RulesFacts({ facts }: Readonly<{ facts: Facts }>) {
  const t = useT();
  const fmt = useFormat();
  return (
    <Row wrap gap={16}>
      <Fact label={t('acq.factResolution')} value={label(facts.resolution)} />
      <Fact label={t('acq.factSource')} value={label(facts.source)} />
      <Fact label={t('acq.factCodec')} value={label(facts.codec)} />
      <Fact label={t('acq.factHdr')} value={facts.hdr.map(factLabel).join(', ')} />
      <Fact label={t('acq.factGroup')} value={facts.group} />
      <Fact label={t('acq.factEdition')} value={facts.edition} />
      <Fact label={t('acq.factLanguages')} value={languages(facts, t('acq.factOriginal'))} />
      <Fact label={t('acq.factSubtitles')} value={facts.subtitles.join(', ')} />
      <Fact label={t('acq.factAudio')} value={audio(facts)} />
      <Fact label={t('acq.factFlags')} value={facts.flags.join(', ')} />
      <Fact
        label={t('requests.colSize')}
        value={facts.sizeBytes ? fmt.bytes(facts.sizeBytes) : null}
      />
      <Fact label={t('acq.factRevision')} value={`v${facts.revision}`} />
    </Row>
  );
}

function label(value: string | null | undefined): string | null {
  return value ? factLabel(value) : null;
}

function languages(facts: Facts, originalLabel: string): string {
  const tags = [...facts.languages.explicit];
  if (facts.languages.original) tags.unshift(originalLabel);
  return tags.join(', ');
}

function audio(facts: Facts): string {
  return facts.audio
    .map((track) => [track.codec, track.channels, track.language].filter(Boolean).join(' '))
    .filter((line) => line.length > 0)
    .join(' · ');
}

function Fact({ label, value }: Readonly<{ label: string; value: string | null | undefined }>) {
  const t = useT();
  return (
    <Box w={FACT_W}>
      <DataField.Root size="sm">
        <DataField.Label>{label}</DataField.Label>
        <DataField.Value lines={1}>
          {value || (
            <Text variant="meta" color="textDim">
              {t('common.none')}
            </Text>
          )}
        </DataField.Value>
      </DataField.Root>
    </Box>
  );
}
