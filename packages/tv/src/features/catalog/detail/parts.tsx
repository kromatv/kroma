import type { CastMember } from '@kroma/core';
import { endsAtClock, useLocale, useT } from '@kroma/ui';
import {
  AVATAR_GRADIENTS,
  Box,
  Button,
  Icon,
  IconButton,
  PersonCard,
  Rail,
  styles,
  Text,
} from '@kroma/ui/kit';
import { useClient, useNav } from '#tv/app/router';

/** "Se termine à 21h32 si vous lancez maintenant", only when a runtime is known. */
export function EndsAtHint({ runtimeMs }: Readonly<{ runtimeMs?: number | null }>) {
  const t = useT();
  const locale = useLocale();
  const at = endsAtClock(runtimeMs, locale);
  if (!at) return null;
  return (
    <Box row align="center" gap={9} mt={12}>
      <Icon name="clock" size={16} thickness={1.8} color="accentText" />
      <Text style={s.sectionLabelSm} color="text/55">
        {t('content.endsAt', { time: at })}
      </Text>
    </Box>
  );
}

/** Top-billed cast. Shows the real TMDB headshot when present, else a
 * per-position gradient with initials. Each face opens that person's titles. */
export function CastRow({ cast }: Readonly<{ cast?: CastMember[] | null }>) {
  const t = useT();
  const client = useClient();
  const nav = useNav();
  if (!cast || cast.length === 0) return null;
  return (
    <Box mt={32} gap={16}>
      <Text style={s.sectionLabel} color="text/55">
        {t('content.cast')}
      </Text>
      <Rail.Root inset={6}>
        {cast.slice(0, 16).map((p, i) => (
          <PersonCard
            key={`${p.name}-${p.character ?? ''}`}
            name={p.name}
            role={p.character}
            photo={client.resolveArt(p.profileUrl, FACE_W)}
            gradient={CAST_GRADIENTS[i % CAST_GRADIENTS.length] as string}
            label={t('person.viewWorks', { name: p.name })}
            onPress={() => nav.go('person', { name: p.name })}
          />
        ))}
      </Rail.Root>
    </Box>
  );
}

/** My-list toggle. */
export function ListButton({
  inList,
  onToggle,
}: Readonly<{ inList: boolean; onToggle: () => void }>) {
  const t = useT();
  return (
    <Button
      variant="outline"
      size="lg"
      active={inList}
      pressed={inList}
      icon={inList ? 'bookmark-filled' : 'bookmark'}
      label={inList ? t('content.inList') : t('content.addToList')}
      onPress={onToggle}
    />
  );
}

/** Watched toggle: marks a title seen / unseen (persisted via the watched API). */
export function WatchedButton({
  watched,
  onToggle,
}: Readonly<{ watched: boolean; onToggle: () => void }>) {
  const t = useT();
  return (
    <Button
      variant="outline"
      size="lg"
      active={watched}
      pressed={watched}
      icon="check"
      label={watched ? t('content.watched') : t('content.markWatched')}
      onPress={onToggle}
    />
  );
}

/** Opens the report screen for this title. Deliberately the quiet, icon-only
 * control of the action row: reachable, but never what the remote lands on
 * next to Play. */
export function ReportButton({ onPress }: Readonly<{ onPress: () => void }>) {
  const t = useT();
  return (
    <IconButton icon="flag" glyph={24} diameter={60} label={t('report.action')} onPress={onPress} />
  );
}

/** Round mute toggle for the show's theme song (remote-focusable). */
export function ThemeButton({
  muted,
  onToggle,
}: Readonly<{ muted: boolean; onToggle: () => void }>) {
  const t = useT();
  const label = muted ? t('content.unmuteTheme') : t('content.muteTheme');
  return (
    <IconButton
      icon={muted ? 'volume-off' : 'volume'}
      glyph={24}
      diameter={60}
      label={label}
      onPress={onToggle}
    />
  );
}

const s = styles({
  sectionLabelSm: { fontSize: 15, fontWeight: '600' },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});

// Cast-circle gradients, cycled by position so adjacent faces never share a colour.
const CAST_GRADIENTS = [...AVATAR_GRADIENTS, 'linear-gradient(135deg, #FBBF24, #F97316)'];

const FACE_W = 96;
