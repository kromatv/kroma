import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { Wheel } from '#ui/components/atoms/wheel';
import { sv, useSv, type Variant } from '#ui/core';
import { typeSpec as textRoles } from '#ui/core/tokens';

const kidsMarkVariants = sv({
  slots: {
    root: {
      row: true,
      align: 'center',
      gap: 5,
      self: 'flex-start',
      radius: 'pill',
      bg: 'surface2',
      borderWidth: 1,
      borderColor: 'white/12',
    },
    word: { font: 'ui', fontWeight: '800', color: 'text' },
  },
  variants: {
    size: {
      sm: { root: { py: 3, pl: 4, pr: 8 }, word: { fontSize: textRoles.overline.size } },
      md: { root: { py: 4, pl: 5, pr: 11 }, word: { fontSize: textRoles.meta.size } },
    },
  },
  defaults: { size: 'sm' },
});

const WHEEL = { sm: 14, md: 18 } as const;

interface KidsMarkProps {
  size?: Variant<typeof kidsMarkVariants, 'size'>;
}

/**
 * The KROMA Kids mark: the KROMA wheel and the word Kids, on a solid ground so
 * it reads over any avatar. A brand name, so the word is never translated.
 */
function KidsMark({ size = 'sm' }: Readonly<KidsMarkProps>) {
  const scoped = useSv(kidsMarkVariants);
  const s = scoped({ size });
  return (
    <Box style={s.root} accessibilityRole="image" accessibilityLabel="KROMA Kids">
      <Wheel size={WHEEL[size]} />
      <Text lines={1} style={s.word}>
        Kids
      </Text>
    </Box>
  );
}

export type { KidsMarkProps };
export { KidsMark, kidsMarkVariants };
