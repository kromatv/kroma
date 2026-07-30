// The cast rail's tile, on both distances.
//
// `ring={false}` is deliberate: the focus ring is drawn on the photo instead, so
// a lit circle reads as a face being pointed at rather than a form field.

import { Avatar } from '#ui/components/atoms/avatar';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Txt } from '#ui/components/atoms/text';
import { sv } from '#ui/lib/sv';
import { radius, ring } from '#ui/lib/tokens';

type PersonCardSize = 'sm' | 'tv';

const personCardVariants = sv({
  slots: {
    root: { alignItems: 'center', flexShrink: 0 },
    name: { fontWeight: '600', textAlign: 'center' },
    role: { fontWeight: '500', textAlign: 'center' },
  },
  variants: {
    size: {
      sm: {
        root: { width: 92, gap: 5 },
        name: { fontSize: 11, lineHeight: 14 },
        role: { fontSize: 10 },
      },
      tv: {
        root: { width: 120, gap: 6 },
        name: { fontSize: 16 },
        role: { fontSize: 14 },
      },
    },
  },
  defaults: { size: 'tv' },
});

const FACE = { sm: 84, tv: 120 } as const;
const NAME_LINES = { sm: 2, tv: 1 } as const;

interface PersonCardProps {
  name: string;
  role?: string | null;
  photo?: string | null;
  gradient?: string;
  size?: PersonCardSize;
  label?: string;
  onPress?: () => void;
}

function PersonCard({
  name,
  role,
  photo,
  gradient,
  size = 'tv',
  label,
  onPress,
}: Readonly<PersonCardProps>) {
  const s = personCardVariants({ size });
  return (
    <Focusable
      onPress={onPress}
      label={label ?? name}
      focusScale={1.06}
      ring={false}
      style={s.root}
      pressedStyle={PRESSED}
    >
      {({ focused }) => (
        <>
          <Box radius="pill" style={focused ? RING : null}>
            <Avatar
              name={name}
              src={photo ?? null}
              gradient={gradient}
              size={FACE[size]}
              circle
              shadow={false}
            />
          </Box>
          <Txt lines={NAME_LINES[size]} style={s.name} color={focused ? 'accent' : 'text'}>
            {name}
          </Txt>
          {role ? (
            <Txt lines={1} style={s.role} color="textDim">
              {role}
            </Txt>
          ) : null}
        </>
      )}
    </Focusable>
  );
}

const RING = { boxShadow: ring.focusLift, borderRadius: radius.pill } as const;
const PRESSED = { opacity: 0.7 } as const;

export type { PersonCardProps, PersonCardSize };
export { PersonCard, personCardVariants };
