import type { CrewMember } from '@kromatv/client/media';
import { personSegment } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import {
  Box,
  Button,
  CONTROL,
  classes,
  color,
  DataField,
  IconButton,
  styles,
  Text,
  useEntryDefaults,
  useStyles,
} from '@kromatv/ui/kit';
import { Link } from '@tanstack/react-router';
import { useFocusRing } from '#web/shared/lib/use-focus-ring.hook';

const FIELD_GAP_X = { base: 24, md: 44 } as const;
const sDefinition = styles({
  rule: { borderTopWidth: 1, borderTopColor: 'white/8' },
  link: { color: 'inherit', textDecorationLine: 'underline', textUnderlineOffset: 2, radius: 'xs' },
  bold: { fontWeight: '600' },
  title: {
    textShadow: [
      `0 0 2px ${color('black/55')}`,
      `0 2px 8px ${color('black/55')}`,
      `0 8px 30px ${color('black/60')}`,
    ].join(', '),
  },
});

function DirectorLink({ person, label }: Readonly<{ person: CrewMember; label: string }>) {
  const s = useStyles(sDefinition);

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
  const s = useStyles(sDefinition);

  const t = useT();
  if (!directors || directors.length === 0) {
    return null;
  }
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
  if (!onToggle) {
    return null;
  }
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
  const entryDefaults = useEntryDefaults();
  const t = useT();
  if (!onToggle) {
    return null;
  }
  return (
    <IconButton
      diameter={CONTROL[entryDefaults.size].height}
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
  const entryDefaults = useEntryDefaults();
  const t = useT();
  if (!onReport) {
    return null;
  }
  return (
    <IconButton
      diameter={CONTROL[entryDefaults.size].height}
      glyph={19}
      radius="md"
      icon="flag"
      label={t('report.action')}
      onPress={onReport}
    />
  );
}

type HeroField = Readonly<{ label: string; value: string }>;

const NO_STUDIOS: readonly string[] = [];

const isShown = (field: Readonly<{ label: string; value?: string }>): field is HeroField =>
  field.value != null;

/** The audio and subtitles a title plays with, and the studios that made it,
 * under a rule. Nothing when none is known. */
export function HeroFields({
  audio,
  subtitles,
  studios = NO_STUDIOS,
}: Readonly<{ audio?: string; subtitles?: string; studios?: readonly string[] }>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const fields = [
    { label: t('content.fieldAudio'), value: audio },
    { label: t('content.fieldSubtitles'), value: subtitles },
    {
      label: t('content.fieldStudios', { count: studios.length }),
      value: studios.length > 0 ? studios.join(', ') : undefined,
    },
  ].filter(isShown);
  if (fields.length === 0) {
    return null;
  }
  return (
    <Box row wrap gapX={FIELD_GAP_X} gapY={16} py={18} style={s.rule}>
      {fields.map((field) => (
        <DataField.Root key={field.label} size="md">
          <DataField.Label>{field.label}</DataField.Label>
          <DataField.Value>{field.value}</DataField.Value>
        </DataField.Root>
      ))}
    </Box>
  );
}

const sameName = (a: string, b: string) =>
  a.trim().localeCompare(b.trim(), undefined, { sensitivity: 'accent' }) === 0;

/** The hero's title, with the title in its original language under it when the
 * two differ by more than their case. */
export function HeroTitle({
  title,
  originalTitle,
}: Readonly<{ title: string; originalTitle: string | null | undefined }>) {
  const s = useStyles(sDefinition);
  const other = originalTitle && !sameName(originalTitle, title) ? originalTitle : null;
  return (
    <>
      <h1 className={classes(s.title)}>
        <Text variant="h1" mb={other ? 6 : 16}>
          {title}
        </Text>
      </h1>
      {other ? (
        <Text variant="label" color="white/72" mb={16}>
          {other}
        </Text>
      ) : null}
    </>
  );
}
