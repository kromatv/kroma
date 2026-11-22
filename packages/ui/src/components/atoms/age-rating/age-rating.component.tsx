import { sv, useSv, type Variant } from '#ui/core';
import { typeSpec as textRoles } from '#ui/core/tokens';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { useTDefault } from '#ui/services/i18n';

const ageRatingVariants = sv({
  slots: {
    root: {
      row: true,
      align: 'center',
      gap: 6,
      self: 'flex-start',
      radius: 'xs',
      borderWidth: 1,
      borderColor: 'text/50',
    },
    label: { font: 'ui', fontWeight: '700', color: 'text' },
    country: { font: 'ui', fontWeight: '600', color: 'text/60' },
  },
  variants: {
    /** `art` is painted over artwork, in white whatever the theme: a native
     *  surface has no ground to scope the theme's inks to. */
    tone: {
      page: {},
      art: {
        root: { borderColor: 'white/55' },
        label: { color: 'white' },
        country: { color: 'white/70' },
      },
    },
    size: {
      sm: {
        root: { py: 2, px: 7 },
        label: { fontSize: textRoles.overline.size, letterSpacing: 0.44 },
        country: { fontSize: textRoles.overline.size, letterSpacing: 0.44 },
      },
      tv: {
        root: { py: 3, px: 9 },
        label: { fontSize: textRoles.meta.size, letterSpacing: 0.26 },
        country: { fontSize: textRoles.meta.size, letterSpacing: 0.26 },
      },
    },
  },
  defaults: { tone: 'page', size: 'sm' },
});

/** A title's age rating as the server resolved it for the reader. */
interface AgeRatingValue {
  label: string;
  country: string;
  borrowed: boolean;
}

interface AgeRatingProps {
  /** The rating to draw. A title with none draws nothing, so the caller passes it as it came. */
  rating: AgeRatingValue | null | undefined;
  tone?: Variant<typeof ageRatingVariants, 'tone'>;
  size?: Variant<typeof ageRatingVariants, 'size'>;
}

/**
 * A title's age rating: the label of the reader's own country, or another
 * country's label followed by that country when the reader's never rated it.
 */
function AgeRating({ rating, tone = 'page', size = 'sm' }: Readonly<AgeRatingProps>) {
  const scoped = useSv(ageRatingVariants);
  const t = useTDefault();
  if (!rating) {
    return null;
  }
  const s = scoped({ tone, size });
  const name = rating.borrowed
    ? t('content.ageRatingBorrowed', { label: rating.label, country: rating.country })
    : t('content.ageRating', { label: rating.label });
  return (
    <Box style={s.root} accessibilityRole="text" accessibilityLabel={name}>
      <Text lines={1} style={s.label}>
        {rating.label}
      </Text>
      {rating.borrowed ? (
        <Text lines={1} style={s.country}>
          {rating.country}
        </Text>
      ) : null}
    </Box>
  );
}

export type { AgeRatingProps, AgeRatingValue };
export { AgeRating, ageRatingVariants };
