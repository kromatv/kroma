import type { Release } from '@kromatv/client/releases';
import { useLocale, useT } from '@kromatv/ui';
import { Badge, Box, Focusable, Row, sv, Text } from '@kromatv/ui/kit';
import { ScrollView } from 'react-native';
import { formatReleaseDate } from '#web/features/releases/release-model';

const entry = sv({
  base: {
    row: true,
    align: 'flex-start',
    gap: 10,
    px: 10,
    py: 9,
    radius: 'sm',
    _hover: { bg: 'tint/5' },
  },
  variants: {
    selected: { true: { bg: 'tint/8', _hover: { bg: 'tint/8' } }, false: {} },
  },
  defaults: { selected: false },
});

interface VersionListProps {
  releases: readonly Release[];
  current: string;
  selected: string;
  onSelect: (version: string) => void;
  horizontal: boolean;
}

export function VersionList({
  releases,
  current,
  selected,
  onSelect,
  horizontal,
}: Readonly<VersionListProps>) {
  const entries = releases.map((release) => (
    <VersionEntry
      key={release.version}
      release={release}
      current={release.version === current}
      selected={release.version === selected}
      onSelect={onSelect}
    />
  ));
  if (horizontal) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Row role="tablist" gap={8}>
          {entries}
        </Row>
      </ScrollView>
    );
  }
  return (
    <Box role="tablist" w={220} shrink={0} gap={2}>
      {entries}
    </Box>
  );
}

interface VersionEntryProps {
  release: Release;
  current: boolean;
  selected: boolean;
  onSelect: (version: string) => void;
}

function VersionEntry({ release, current, selected, onSelect }: Readonly<VersionEntryProps>) {
  const t = useT();
  const locale = useLocale();
  const date = formatReleaseDate(release.date, locale, 'medium');
  return (
    <Focusable
      sv={entry}
      vars={{ selected }}
      role="tab"
      selected={selected}
      onPress={() => onSelect(release.version)}
    >
      <Box w={7} h={7} mt={6} radius="pill" bg={current ? 'accent' : 'glyphDim'} />
      <Box gap={2}>
        <Row gap={8}>
          <Text variant="meta" color={selected ? 'text' : 'textMuted'}>
            {release.version}
          </Text>
          {current ? <Badge tone="success">{t('releases.current')}</Badge> : null}
        </Row>
        {date ? (
          <Text variant="meta" color="textDim">
            {date}
          </Text>
        ) : null}
      </Box>
    </Focusable>
  );
}
