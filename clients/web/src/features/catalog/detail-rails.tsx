// The two horizontal rails under a detail hero: the cast, and similar titles.

import { type CastMember, personSegment, posterColors } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, color, Focusable, gradient, type HostElement, sv, Text, themed } from '@kroma/ui/kit';
import type { CSSProperties } from 'react';
import { imageUrl } from '#web/shared/lib/api';
import { Image, Poster, PosterRail } from '#web/shared/ui';
import { RouteLink } from '#web/shared/ui/route-link';

// The page gutter is a fluid CSS custom property and `overflow-x` names one
// axis, so both scrollers stay plain elements around kit content.
const GUTTER: CSSProperties = {
  paddingLeft: 'var(--gutter-web)',
  paddingRight: 'var(--gutter-web)',
};

// `scrollbar-width` only; the legacy `::-webkit-scrollbar` rule it used to pair
// with needs a stylesheet, which an inline style has no way to reach.
const CAST_SCROLLER: CSSProperties = {
  ...GUTTER,
  display: 'flex',
  gap: 22,
  overflowX: 'auto',
  paddingTop: 16,
  paddingBottom: 16,
  scrollbarWidth: 'none',
};

const AVATAR: CSSProperties = {
  width: '100%',
  aspectRatio: '1',
  borderRadius: '50%',
  marginBottom: 11,
  boxShadow: `0 8px 22px ${color('black/45')}`,
  transition: 'outline-color .2s',
  outlineColor: 'transparent',
};

const avatarRing = themed((theme): CSSProperties => ({ ...AVATAR, ...theme.ring.focus }));

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
    <section style={CAST_SECTION}>
      <h2 style={GUTTER}>
        <Text variant="h2" mb={18}>
          {t('content.cast')}
        </Text>
      </h2>
      {/* A named <section> for assistive tech. */}
      <section aria-label={t('content.cast')} style={CAST_SCROLLER}>
        {cast.map((p) => (
          <CastTile key={`${p.name}-${p.character ?? ''}`} person={p} />
        ))}
      </section>
    </section>
  );
}

const CAST_SECTION: CSSProperties = { marginTop: 40 };
const SIMILAR_SECTION: CSSProperties = { marginTop: 44 };

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
      as={<RouteLink to="/people/$person" params={{ person: personSegment(person) }} />}
    >
      {({ hovered, focused }) => (
        <>
          <Image
            style={hovered || focused ? avatarRing() : AVATAR}
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
        </>
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
  as?: HostElement;
}

/** Horizontal "Titres similaires" rail of poster tiles. */
export function SimilarRail({ title, items }: Readonly<{ title: string; items: SimilarItem[] }>) {
  if (items.length === 0) return null;
  return (
    <section style={SIMILAR_SECTION}>
      <h2 style={GUTTER}>
        <Text variant="h2" mb={16}>
          {title}
        </Text>
      </h2>
      <div style={GUTTER}>
        <PosterRail
          data={items}
          renderItem={(m) => (
            <Poster
              title={m.title}
              genre={m.genre}
              colors={posterColors(m.id)}
              poster={m.poster}
              as={m.as}
            />
          )}
        />
      </div>
    </section>
  );
}

function CastInitials({ name, g1, g2 }: Readonly<{ name: string; g1: string; g2: string }>) {
  return (
    <Box fill center style={gradient(`linear-gradient(158deg, ${g1}, ${g2})`)}>
      <Box fill style={SHEEN} />
      <Text variant="h1" color="white/90">
        {initials(name)}
      </Text>
    </Box>
  );
}

const SHEEN = gradient(
  `radial-gradient(70% 60% at 50% 22%, ${color('white/20')}, transparent 60%)`,
);
