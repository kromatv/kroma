import type { Highlight, Release } from '@kromatv/client/releases';
import { useLocale, useT } from '@kromatv/ui';
import {
  Box,
  Callout,
  Icon,
  type IconName,
  Row,
  Section,
  Text,
  useBreakpoint,
} from '@kromatv/ui/kit';
import { HighlightCard } from '#web/features/releases/highlight-card';
import {
  formatReleaseDate,
  highlightLayout,
  releaseCounts,
} from '#web/features/releases/release-model';

export function ReleaseArticle({ release }: Readonly<{ release: Release }>) {
  const t = useT();
  const locale = useLocale();
  const date = formatReleaseDate(release.date, locale, 'long');
  const counts = releaseCounts(release)
    .map(({ key, count }) => t(key, { count }))
    .join(' · ');
  return (
    <Box gap={28}>
      <Box gap={10}>
        {date ? (
          <Text variant="overline" color="accentText">
            {date}
          </Text>
        ) : null}
        <Row wrap gap={14} align="baseline">
          <Text variant="heading" accessibilityRole="header">
            {t('releases.version', { version: release.version })}
          </Text>
          {counts ? (
            <Text variant="meta" color="textDim">
              {counts}
            </Text>
          ) : null}
        </Row>
      </Box>
      {release.action.length > 0 ? (
        <Callout.Root tone="accent" icon="info-circle">
          <Callout.Title>{t('releases.action')}</Callout.Title>
          {release.action.map((line) => (
            <Callout.Detail key={line}>{line}</Callout.Detail>
          ))}
        </Callout.Root>
      ) : null}
      <HighlightGrid highlights={release.highlights} />
      <NoteList title={t('releases.fixed')} icon="check" ink="success" lines={release.fixed} />
      <NoteList title={t('releases.owner')} icon="server" ink="glyph" lines={release.owner} />
    </Box>
  );
}

function HighlightGrid({ highlights }: Readonly<{ highlights: readonly Highlight[] }>) {
  const columns = useBreakpoint() === 'base' ? 1 : 2;
  const { lead, rows } = highlightLayout(highlights, columns);
  if (!lead && rows.length === 0) return null;
  return (
    <Box gap={16}>
      {lead ? <HighlightCard highlight={lead} lead /> : null}
      {rows.map((row) => (
        <Box key={row.map(({ title }) => title).join('\n')} row gap={16}>
          {row.map((highlight) => (
            <Box key={highlight.title} flex>
              <HighlightCard highlight={highlight} />
            </Box>
          ))}
          {row.length < columns ? <Box flex /> : null}
        </Box>
      ))}
    </Box>
  );
}

interface NoteListProps {
  title: string;
  icon: IconName;
  ink: 'success' | 'glyph';
  lines: readonly string[];
}

function NoteList({ title, icon, ink, lines }: Readonly<NoteListProps>) {
  if (lines.length === 0) return null;
  return (
    <Section.Root gap={12}>
      <Section.Header>
        <Section.Title>{title}</Section.Title>
      </Section.Header>
      {lines.map((line) => (
        <Row key={line} align="flex-start" gap={12}>
          <Box pt={4}>
            <Icon name={icon} size={16} thickness={2} color={ink} />
          </Box>
          <Box flex minW={0}>
            <Text variant="body" color="text/85">
              {line}
            </Text>
          </Box>
        </Row>
      ))}
    </Section.Root>
  );
}
