// The cast rail's tile, on both distances.
//
// The focus ring is drawn on the photo instead of around the tile, which is why
// the card draws none of its own: a lit circle reads as a face being pointed at
// rather than a form field.

import { Avatar, type AvatarProps } from '#ui/components/atoms/avatar';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Text, type TextProps } from '#ui/components/atoms/text';
import { type StyleDecl, svFor } from '#ui/core';

type PersonCardSize = 'sm' | 'tv';

const personCardVariants = svFor<{
  root: StyleDecl;
  face: StyleDecl;
  name: StyleDecl;
  role: StyleDecl;
  // Required, or a props slot whose keys are all optional collapses back into a
  // style slot; the base carries the `tv` metrics every option inherits.
  photo: Required<Pick<AvatarProps, 'size'>>;
  caption: Required<Pick<TextProps, 'lines'>>;
}>()({
  slots: {
    root: { align: 'center', shrink: 0, _press: { opacity: 0.7 } },
    face: { radius: 'circle', _focus: { ring: 'focusLift' } },
    name: {
      fontWeight: '600',
      textAlign: 'center',
      color: 'text',
      _focus: { color: 'accentText' },
    },
    role: { fontWeight: '500', textAlign: 'center' },
    photo: { size: 120 },
    caption: { lines: 1 },
  },
  variants: {
    size: {
      sm: {
        root: { w: 92, gap: 5 },
        name: { fontSize: 11, lineHeight: 14 },
        role: { fontSize: 10 },
        photo: { size: 84 },
        caption: { lines: 2 },
      },
      tv: {
        root: { w: 120, gap: 6 },
        name: { fontSize: 16 },
        role: { fontSize: 14 },
      },
    },
  },
  defaults: { size: 'tv' },
});

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
  return (
    <Focusable
      onPress={onPress}
      label={label ?? name}
      focusScale={1.06}
      ring={false}
      sv={personCardVariants}
      vars={{ size }}
    >
      {(state) => (
        <>
          <Box style={state.slots.face}>
            <Avatar
              name={name}
              src={photo ?? null}
              gradient={gradient}
              circle
              shadow={false}
              {...state.slots.photo}
            />
          </Box>
          <Text style={state.slots.name} {...state.slots.caption}>
            {name}
          </Text>
          {role ? (
            <Text lines={1} style={state.slots.role} color="textDim">
              {role}
            </Text>
          ) : null}
        </>
      )}
    </Focusable>
  );
}

export type { PersonCardProps, PersonCardSize };
export { PersonCard, personCardVariants };
