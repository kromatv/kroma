// <PersonCard>: a person, as a circle.
//
// The cast rail's tile, on both distances. A round photo (initials on a wash
// when there is none), the name, and the line that says who they were in this
// title. It was written twice - once for the TV's detail page at 120pt, once
// for the phone's at 84 - and the two had drifted into different type, different
// clamping and different press feedback for what is one card in the design.
//
// The ring is drawn on the PHOTO, not as a box around the whole tile, and the
// name tints amber alongside it. That is the reason the focusable turns its own
// ring off: a rectangle around a circle and its caption reads as a form field,
// where a lit circle reads as a face being pointed at. On glass there is no
// focus at all, so the card dims under the thumb instead.

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
      /** A thumb's rail: the name may wrap, because a phone's row is narrow and
       *  a truncated surname helps nobody. */
      sm: {
        root: { width: 92, gap: 5 },
        name: { fontSize: 11, lineHeight: 14 },
        role: { fontSize: 10 },
      },
      /** The 10-foot rail: one line each, so a row of faces keeps its baseline. */
      tv: {
        root: { width: 120, gap: 6 },
        name: { fontSize: 16 },
        role: { fontSize: 14 },
      },
    },
  },
  defaults: { size: 'tv' },
});

/** The photo's diameter, and how far the name may wrap, per size. */
const FACE = { sm: 84, tv: 120 } as const;
const NAME_LINES = { sm: 2, tv: 1 } as const;

interface PersonCardProps {
  name: string;
  /** The line under the name: the character played, the job, a count. */
  role?: string | null;
  /** Resolved photo URL. Without one the card falls back to initials. */
  photo?: string | null;
  /** The wash behind those initials. Give faces in one rail different washes so
   *  neighbours never share a colour. */
  gradient?: string;
  size?: PersonCardSize;
  /** What the remote and VoiceOver announce. Defaults to the name, but a caller
   *  that knows where the card leads should say so ("View Tom Hanks's titles"). */
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
