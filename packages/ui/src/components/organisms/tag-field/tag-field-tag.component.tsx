import { type ReactNode, useMemo } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon } from '#ui/components/atoms/icon';
import { IconButton } from '#ui/components/atoms/icon-button';
import { Text } from '#ui/components/atoms/text';
import { markCorner } from '#ui/components/organisms/suggestions/entry-metrics';
import { MediaPlaceContext } from '#ui/components/organisms/suggestions/suggestion-context';
import { sharedStyle, sv, useStyleScope, useSv } from '#ui/core';
import { nestedRadius, type Radius } from '#ui/core/tokens';
import { sortParts } from '#ui/lib/parts';
import { useTDefault } from '#ui/services/i18n';
import { type TagFieldState, useTagField } from './tag-field-context';
import { Media } from './tag-field-parts.component';

interface TagFieldTagProps {
  /** The name this tag stands for. A tag is drawn for every name of the value
   *  whether or not one is written; writing it gives that name its face. */
  value: string;
  /** Its <TagField.Media>. Without one, a tag added from a suggestion keeps
   *  the mark the suggestion had. */
  children?: ReactNode;
}

const tagVariants = sv({
  slots: {
    root: { row: true, align: 'center', bg: 'tint/10', shrink: 1, minW: 0 },
    label: { color: 'text', fontWeight: '600', shrink: 1 },
  },
  variants: {
    stop: { true: { root: { _hover: { bg: 'tint/16' }, _focus: { bg: 'accentSoft' } } } },
  },
  defaults: { stop: false },
});

const REMOVAL_INSET = 4;
const GLYPH_SHARE = 0.6;

interface TagLook {
  field: TagFieldState;
  value: string;
  face: ReactNode;
}

function useTagBox({ field, face }: Readonly<TagLook>) {
  const scope = useStyleScope();
  const { mark: tag, markMedia: tagMedia, gap, fontSize } = field.metrics;
  const corner = markCorner(field.metrics, scope);
  const removal = tag - 2 * REMOVAL_INSET;
  const ps = face === null ? gap + REMOVAL_INSET : (tag - tagMedia) / 2;
  const key = `tag-field:tag:${tag}:${ps}:${gap}:${corner}`;
  return {
    removal,
    removalCorner: nestedRadius(corner, REMOVAL_INSET),
    mediaCorner: nestedRadius(corner, (tag - tagMedia) / 2),
    glyph: Math.round(removal * GLYPH_SHARE),
    box: sharedStyle(key, { h: tag, gap: gap - 2, ps, pe: REMOVAL_INSET, radius: corner }, scope),
    ink: sharedStyle(`tag-field:ink:${fontSize}`, { fontSize }, scope),
  };
}

type FaceProps = Readonly<{ look: TagLook; ink: StyleProp<TextStyle>; corner: Radius }>;

function TagFace({ look, ink, corner }: FaceProps) {
  const slots = useSv(tagVariants)({ stop: false });
  const size = look.field.metrics.markMedia;
  const place = useMemo(() => ({ name: look.value, size, corner }), [look.value, size, corner]);
  return (
    <>
      <MediaPlaceContext value={place}>{look.face}</MediaPlaceContext>
      <Text lines={1} style={[slots.label, ink]}>
        {look.value}
      </Text>
    </>
  );
}

function TagStop(look: Readonly<TagLook>) {
  const t = useTDefault();
  const { box, ink, removal, glyph, mediaCorner } = useTagBox(look);
  return (
    <Focusable
      label={t('tagField.remove', { name: look.value })}
      disabled={look.field.disabled}
      onPress={() => look.field.remove(look.value)}
      sv={tagVariants}
      vars={{ stop: true }}
      style={box}
    >
      <TagFace look={look} ink={ink} corner={mediaCorner} />
      <Box w={removal} h={removal} center>
        <Icon name="x" size={glyph} color="textMuted" />
      </Box>
    </Focusable>
  );
}

function TagPill(look: Readonly<TagLook>) {
  const t = useTDefault();
  const slots = useSv(tagVariants)({ stop: false });
  const { box, ink, removal, glyph, mediaCorner, removalCorner } = useTagBox(look);
  return (
    <Box style={[slots.root, box]}>
      <TagFace look={look} ink={ink} corner={mediaCorner} />
      {look.field.disabled ? null : (
        <IconButton
          icon="x"
          variant="ghost"
          diameter={removal}
          radius={removalCorner}
          glyph={glyph}
          label={t('tagField.remove', { name: look.value })}
          focusScale={1}
          onPress={() => look.field.remove(look.value)}
        />
      )}
    </Box>
  );
}

/** One name of the value, in the well. Its place is the name's place in the
 *  value, wherever it is written; a <TagField.Tag> only declares the face of
 *  the name it gives. Under a D-pad the whole tag is a stop whose press takes
 *  it out; under a pointer its remove control does. */
function Tag({ value, children }: Readonly<TagFieldTagProps>) {
  const field = useTagField('Tag');
  const [written] = sortParts(children, Media);
  const face = written.length > 0 ? written : (field.faces.get(value) ?? null);
  const look = { field, value, face };
  return field.presentation === 'dialog' ? <TagStop {...look} /> : <TagPill {...look} />;
}

export type { TagFieldTagProps };
export { Tag };
