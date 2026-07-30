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
  Txt,
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
      <Icon name="clock" size={16} stroke={1.8} color="accent" />
      <Txt style={SECTION_LABEL_SM} color="rgba(244, 243, 240, 0.55)">
        {t('content.endsAt', { time: at })}
      </Txt>
    </Box>
  );
}

const SECTION_LABEL_SM = { fontSize: 15, fontWeight: '600' as const };

const SECTION_LABEL = {
  fontSize: 15,
  fontWeight: '700' as const,
  letterSpacing: 0.6,
  textTransform: 'uppercase' as const,
};

/** Top-billed cast. Shows the real TMDB headshot when present, else a
 * per-position gradient with initials. Each face opens that person's titles. */
export function CastRow({ cast }: Readonly<{ cast?: CastMember[] | null }>) {
  const t = useT();
  const client = useClient();
  const nav = useNav();
  if (!cast || cast.length === 0) return null;
  return (
    <Box mt={32} gap={16}>
      <Txt style={SECTION_LABEL} color="rgba(244, 243, 240, 0.55)">
        {t('content.cast')}
      </Txt>
      <Rail inset={6} gap={24}>
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
      </Rail>
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
      icon={inList ? 'check' : 'plus'}
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
      icon="check"
      label={watched ? t('content.watched') : t('content.markWatched')}
      onPress={onToggle}
    />
  );
}

/** Opens the report screen for this title. Deliberately the quiet, icon-only
 * control of the action row — reachable, but never what the remote lands on
 * next to Play. */
export function ReportButton({ onPress }: Readonly<{ onPress: () => void }>) {
  const t = useT();
  return (
    <IconButton icon="flag" glyph={24} size={60} label={t('report.action')} onPress={onPress} />
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
      size={60}
      label={label}
      onPress={onToggle}
    />
  );
}

// Cast-circle gradients, cycled by position so adjacent faces never share a colour.
const CAST_GRADIENTS = [...AVATAR_GRADIENTS, 'linear-gradient(135deg, #FBBF24, #F97316)'];

const FACE_W = 96;
