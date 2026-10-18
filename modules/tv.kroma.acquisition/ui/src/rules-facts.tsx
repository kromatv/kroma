import { useFormat, useT } from '@kromatv/module-sdk';
import { Box, DataField, Row } from '@kromatv/ui/kit';
import { factLabel } from './fact-labels';
import type { Facts } from './judgement-schemas';

const FACT_W = 150;

export function RulesFacts({ facts }: Readonly<{ facts: Facts }>) {
  const t = useT();
  const fmt = useFormat();
  const read: [string, string | null | undefined][] = [
    [t('acq.factResolution'), label(facts.resolution)],
    [t('acq.factSource'), label(facts.source)],
    [t('acq.factCodec'), label(facts.codec)],
    [t('acq.factHdr'), facts.hdr.map(factLabel).join(', ')],
    [t('acq.factGroup'), facts.group],
    [t('acq.factEdition'), facts.edition],
    [t('acq.factLanguages'), languages(facts, t('acq.factOriginal'))],
    [t('acq.factSubtitles'), facts.subtitles.join(', ')],
    [t('acq.factAudio'), audio(facts)],
    [t('acq.factFlags'), facts.flags.map((flag) => t(`acq.flag.${flag}`)).join(', ')],
    [t('requests.colSize'), facts.sizeBytes ? fmt.bytes(facts.sizeBytes) : null],
    [t('acq.factRevision'), facts.revision > 1 ? `v${facts.revision}` : null],
  ];
  const found = read.filter(([, value]) => Boolean(value));
  return (
    <Row wrap gap={16}>
      {found.map(([name, value]) => (
        <Fact key={name} label={name} value={value as string} />
      ))}
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

function Fact({ label: name, value }: Readonly<{ label: string; value: string }>) {
  return (
    <Box w={{ base: '45%', md: FACT_W }}>
      <DataField.Root size="sm">
        <DataField.Label>{name}</DataField.Label>
        <DataField.Value lines={1}>{value}</DataField.Value>
      </DataField.Root>
    </Box>
  );
}
