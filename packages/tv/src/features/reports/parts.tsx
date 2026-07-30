import type { ReportCategory } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Chip, Icon, ListRow, Rail, REPORT_CATEGORIES, Txt } from '@kroma/ui/kit';
import type { ReportEpisode } from '#tv/app/router';

export function GroupLabel({ text }: Readonly<{ text: string }>) {
  return (
    <Txt variant="overlineTv" color="rgba(244, 243, 240, 0.45)">
      {text}
    </Txt>
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
      <Rail inset={6} gap={10}>
        <Chip
          variant="surface"
          focusScale={1.05}
          active={selectedId === wholeId}
          label={t('report.subjectWhole')}
          onPress={() => onSelect(wholeId)}
        />
        {episodes.map((ep) => (
          <Chip
            key={ep.id}
            variant="surface"
            focusScale={1.05}
            active={selectedId === ep.id}
            label={ep.label}
            onPress={() => onSelect(ep.id)}
          />
        ))}
      </Rail>
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
          <ListRow
            key={c.key}
            autoFocus={index === 0}
            icon={c.icon}
            label={t(c.labelKey)}
            hint={t(c.hintKey)}
            onPress={() => onSelect(c.key)}
            trailing={
              c.key === selected ? <Icon name="check" size={22} color="accent" /> : <Box w={22} />
            }
          />
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
        <Icon name="check" size={48} color="accentInk" stroke={2.4} />
      </Box>
      <Txt style={{ fontSize: 26, fontWeight: '600', textAlign: 'center', maxWidth: 620 }}>
        {t('report.submitted')}
      </Txt>
    </Box>
  );
}
