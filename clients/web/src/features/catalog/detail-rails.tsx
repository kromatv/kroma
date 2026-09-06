// The two horizontal rails under a detail hero: the cast, and similar titles.

import type { CastMember } from '@kroma/client/media';
import { personSegment, posterColors } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, classes, color, Focusable, type HostElement, styles, sv, Text } from '@kroma/ui/kit';
import { imageUrl } from '#web/shared/lib/api';
import { wash } from '#web/shared/lib/art-styles';
import { Image, Poster, PosterRail } from '#web/shared/ui';
import { RouteLink } from '#web/shared/ui/route-link';

// The page gutter is a fluid CSS custom property and `overflow-x` names one
// axis, so both scrollers stay plain elements around kit content.
const GUTTER = { paddingLeft: 'var(--gutter-web)', paddingRight: 'var(--gutter-web)' } as const;

const s = styles({
  gutter: GUTTER,
  castSection: { mt: 40 },
  similarSection: { mt: 44 },
  scroller: {
    ...GUTTER,
    display: 'flex',
    gap: 22,
    overflowX: 'auto',
    pt: 16,
    pb: 16,
    scrollbarWidth: 'none',
  },
  avatar: {
    w: '100%',
    aspectRatio: 1,
    radius: 'circle',
    mb: 11,
    transitionProperty: 'outline-color',
    transitionDuration: '200ms',
    outlineColor: 'transparent',
  },
  avatarLit: { ring: 'focus' },
  sheen: {
    backgroundImage: `radial-gradient(70% 60% at 50% 22%, ${color('white/20')}, transparent 60%)`,
  },
});

const castTile = sv({ base: { shrink: 0, align: 'center', w: { base: 96, md: 112 } } });

/** First + last initials, e.g. "George MacKay" → "GM". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** "Distribution" horizontal rail of initials avatars (matches the design;
 * the reference uses gradient initials, not photos). */
export function CastRail({ cast }: Readonly<{ cast: CastMember[] }>) {
  const t = useT();
  if (cast.length === 0) return null;
  return (
    <section className={classes(s.castSection)}>
      <h2 className={classes(s.gutter)}>
        <Text variant="h2" mb={18}>
          {t('content.cast')}
        </Text>
      </h2>
      {/* A named <section> for assistive tech. */}
      <section aria-label={t('content.cast')} className={classes(s.scroller)}>
        {cast.map((p) => (
          <CastTile key={`${p.name}-${p.character ?? ''}`} person={p} />
        ))}
      </section>
    </section>
  );
}

function CastTile({ person }: Readonly<{ person: CastMember }>) {
  const t = useT();
  const [g1, g2] = posterColors(person.name);
  const photo = imageUrl(person.profileUrl);
  const face = <CastInitials name={person.name} g1={g1} g2={g2} />;
  return (
    <Focusable
      sv={castTile}
      focusScale={1.06}
      ring={false}
      label={t('person.viewWorks', { name: person.name })}
      asChild
    >
      {({ hovered, focused }) => (
        <RouteLink to="/people/$person" params={{ person: personSegment(person) }}>
          <Image
            style={[s.avatar, hovered || focused ? s.avatarLit : null]}
            src={photo}
            alt={person.name}
            placeholder={face}
            fallback={face}
          />
          <Text
            variant="label"
            color={hovered || focused ? 'accent' : 'text'}
            textAlign="center"
            lines={1}
          >
            {person.name}
          </Text>
          {person.character ? (
            <Text variant="meta" color="white/45" textAlign="center" lines={1}>
              {person.character}
            </Text>
          ) : null}
        </RouteLink>
      )}
    </Focusable>
  );
}

export interface SimilarItem {
  id: string;
  title: string;
  genre: string;
  seasonCount?: number;
  badge: string | null;
  poster: string;
  link?: HostElement;
}

/** Horizontal "Titres similaires" rail of poster tiles. */
export function SimilarRail({ title, items }: Readonly<{ title: string; items: SimilarItem[] }>) {
  if (items.length === 0) return null;
  return (
    <section className={classes(s.similarSection)}>
      <h2 className={classes(s.gutter)}>
        <Text variant="h2" mb={16}>
          {title}
        </Text>
      </h2>
      <div className={classes(s.gutter)}>
        <PosterRail
          data={items}
          renderItem={(m) => (
            <Poster
              title={m.title}
              genre={m.genre}
              colors={posterColors(m.id)}
              poster={m.poster}
              asChild={m.link !== undefined}
            >
              {m.link}
            </Poster>
          )}
        />
      </div>
    </section>
  );
}

function CastInitials({ name, g1, g2 }: Readonly<{ name: string; g1: string; g2: string }>) {
  return (
    <Box fill center style={wash(g1, g2)}>
      <Box fill style={s.sheen} />
      <Text variant="h1" color="white/90">
        {initials(name)}
      </Text>
    </Box>
  );
}
