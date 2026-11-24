import { typeSpec as textRoles, fontSizes as textSizes } from '#ui/core/tokens';
import { Avatar, type AvatarProps } from '#ui/components/atoms/avatar';
import { Focusable, FocusRing } from '#ui/components/atoms/focusable';
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
    root: { shrink: 0, _press: { opacity: 0.7 } },
    face: { self: 'center', radius: 'circle' },
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
        name: { fontSize: textRoles.overline.size, lineHeight: 14 },
        role: { fontSize: textSizes.micro },
        photo: { size: 84 },
        caption: { lines: 2 },
      },
      tv: {
        root: { w: 120, gap: 6 },
        name: { fontSize: textRoles.body.size },
        role: { fontSize: textSizes.compactLabel },
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

/** The cast rail's tile, on both distances. */
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
      sv={personCardVariants}
      vars={{ size }}
    >
      {(state) => (
        <>
          <FocusRing style={state.slots.face}>
            <Avatar
              name={name}
              src={photo ?? null}
              gradient={gradient}
              circle
              {...state.slots.photo}
            />
          </FocusRing>
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
