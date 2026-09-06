import type { CrewMember } from '@kroma/client/media';
import { personSegment } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Box,
  Button,
  CONTROL,
  DataField,
  entryDefaultSize,
  IconButton,
  styles,
  Text,
} from '@kroma/ui/kit';
import { Link } from '@tanstack/react-router';
import { useFocusRing } from '#web/shared/lib/use-focus-ring';

const FIELD_GAP_X = { base: 24, md: 44 } as const;
const s = styles({
  rule: { borderTopWidth: 1, borderTopColor: 'white/8' },
  link: { color: 'inherit', textDecorationLine: 'underline', textUnderlineOffset: 2, radius: 'xs' },
  bold: { fontWeight: '600' },
});

function DirectorLink({ person, label }: Readonly<{ person: CrewMember; label: string }>) {
  const focus = useFocusRing(s.link);
  return (
    <Link
      to="/people/$person"
      params={{ person: personSegment(person) }}
      aria-label={label}
      className={focus.className}
      {...focus.bind}
    >
      {person.name}
    </Link>
  );
}

export function DirectorsLine({ directors }: Readonly<{ directors?: CrewMember[] }>) {
  const t = useT();
  if (!directors || directors.length === 0) return null;
  return (
    <Text variant="meta" color="white/60" mb={12}>
      <Text variant="meta" color="white/80" style={s.bold}>
        {t('content.directedBy')}
      </Text>{' '}
      {directors.map((d, i) => (
        <span key={personSegment(d)}>
          {i > 0 ? ', ' : ''}
          <DirectorLink person={d} label={t('person.viewWorks', { name: d.name })} />
        </span>
      ))}
    </Text>
  );
}

export function WatchedButton({
  watched,
  onToggle,
}: Readonly<{ watched?: boolean; onToggle?: () => void }>) {
  const t = useT();
  if (!onToggle) return null;
  return (
    <Button
      variant="outline"
      active={watched ?? false}
      pressed={watched ?? false}
      icon="check"
      label={watched ? t('content.watched') : t('content.markWatched')}
      onPress={onToggle}
    />
  );
}

export function ListButton({
  inList,
  onToggle,
}: Readonly<{ inList?: boolean; onToggle?: () => void }>) {
  const t = useT();
  if (!onToggle) return null;
  return (
    <IconButton
      diameter={CONTROL[entryDefaultSize()].height}
      glyph={20}
      radius="md"
      active={inList ?? false}
      pressed={inList ?? false}
      icon={inList ? 'bookmark-filled' : 'bookmark'}
      label={inList ? t('content.removeFromList') : t('content.addToList')}
      onPress={onToggle}
    />
  );
}

export function ReportButton({ onReport }: Readonly<{ onReport?: () => void }>) {
  const t = useT();
  if (!onReport) return null;
  return (
    <IconButton
      diameter={CONTROL[entryDefaultSize()].height}
      glyph={19}
      radius="md"
      icon="flag"
      label={t('report.action')}
      onPress={onReport}
    />
  );
}

export function HeroFields({ audio, subtitles }: Readonly<{ audio?: string; subtitles?: string }>) {
  const t = useT();
  if (audio == null && subtitles == null) return null;
  return (
    <Box row wrap gapX={FIELD_GAP_X} gapY={16} py={18} style={s.rule}>
      {audio != null ? (
        <DataField.Root size="md">
          <DataField.Label>{t('content.fieldAudio')}</DataField.Label>
          <DataField.Value>{audio}</DataField.Value>
        </DataField.Root>
      ) : null}
      {subtitles != null ? (
        <DataField.Root size="md">
          <DataField.Label>{t('content.fieldSubtitles')}</DataField.Label>
          <DataField.Value>{subtitles}</DataField.Value>
        </DataField.Root>
      ) : null}
    </Box>
  );
}
