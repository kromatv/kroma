import type { ReportCategory } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Chip, Icon, ListRow, Rail, REPORT_CATEGORIES, Text } from '@kroma/ui/kit';
import type { ReportEpisode } from '#tv/app/router';

export function GroupLabel({ text }: Readonly<{ text: string }>) {
  return (
    <Text variant="overlineTv" color="text/45">
      {text}
    </Text>
  );
}

/**
 * What the report is about: the title itself, or one of its episodes. Only a
 * series gets this row a film is its own subject.
 */
export function SubjectRow({
  episodes,
  selectedId,
  wholeId,
  onSelect,
}: Readonly<{
  episodes: ReportEpisode[];
  selectedId: string;
  wholeId: string;
  onSelect: (id: string) => void;
}>) {
  const t = useT();
  return (
    <Box gap={12}>
      <GroupLabel text={t('report.subject')} />
      <Rail.Root inset={6} gap={10}>
        <Chip
          variant="surface"
          focusScale={1.05}
          active={selectedId === wholeId}
          pressed={selectedId === wholeId}
          label={t('report.subjectWhole')}
          onPress={() => onSelect(wholeId)}
        />
        {episodes.map((ep) => (
          <Chip
            key={ep.id}
            variant="surface"
            focusScale={1.05}
            active={selectedId === ep.id}
            pressed={selectedId === ep.id}
            label={ep.label}
            onPress={() => onSelect(ep.id)}
          />
        ))}
      </Rail.Root>
    </Box>
  );
}

/** The categories, one focusable row each; the chosen one keeps a check so the
 * choice survives moving focus away to the send button. */
export function CategoryRows({
  selected,
  onSelect,
}: Readonly<{
  selected: ReportCategory | null;
  onSelect: (category: ReportCategory) => void;
}>) {
  const t = useT();
  return (
    <Box gap={12}>
      <GroupLabel text={t('report.category')} />
      <Box gap={10}>
        {REPORT_CATEGORIES.map((c, index) => (
          <ListRow.Root
            key={c.key}
            autoFocus={index === 0}
            icon={c.icon}
            chevron={false}
            role="option"
            selected={c.key === selected}
            onPress={() => onSelect(c.key)}
          >
            <ListRow.Label>{t(c.labelKey)}</ListRow.Label>
            <ListRow.Hint>{t(c.hintKey)}</ListRow.Hint>
            <ListRow.Trailing>
              {c.key === selected ? <Icon name="check" size={22} color="accentText" /> : null}
            </ListRow.Trailing>
          </ListRow.Root>
        ))}
      </Box>
    </Box>
  );
}

/** The confirmation that replaces the form once the report is in. */
export function ReportSent() {
  const t = useT();
  return (
    <Box center gap={24} py={80}>
      <Box w={104} h={104} center radius="pill" bg="accent">
        <Icon name="check" size={48} color="accentInk" thickness={2.4} />
      </Box>
      <Text variant="headingTv" textAlign="center" maxW={620}>
        {t('report.submitted')}
      </Text>
    </Box>
  );
}
