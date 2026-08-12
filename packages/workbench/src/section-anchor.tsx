// The link on a heading: the address of the section it names, on the clipboard.

import { Focusable, Icon, type IconName, sv, webWindow } from '@kroma/ui/kit';
import { type ColorToken, space } from '@kroma/ui/tokens';
import { useCallback } from 'react';
import { type CopyState, useCopy } from './clipboard';

// The house shape for a copy control: the confirmation is the glyph itself
// turning, and the failure is SAID rather than left looking like a dead press.
const ANCHOR_FACE: Record<CopyState, { label: string; glyph: IconName }> = {
  idle: { label: 'Copy a link to this section', glyph: 'link' },
  copied: { label: 'Link copied', glyph: 'check' },
  failed: { label: 'Could not copy the link', glyph: 'alert-triangle' },
};

const CONFIRM_INK: Record<CopyState, ColorToken> = {
  idle: 'accent',
  copied: 'success',
  failed: 'danger',
};

// Quiet rather than hidden: a glyph that exists only under a pointer is one a
// remote can never find, and this workbench is walked with both.
function anchorInk(state: CopyState, lit: boolean): ColorToken {
  if (state !== 'idle') return CONFIRM_INK[state];
  return lit ? 'accent' : 'textDim';
}

/** A link to one section, copied. Nothing at all where the platform has no
 * clipboard: a television has neither one nor anywhere to paste. */
function SectionAnchor({ id }: Readonly<{ id: string }>) {
  const { available, state, copy } = useCopy();
  const onPress = useCallback(() => copy(sectionHref(id)), [copy, id]);
  if (!available) return null;
  return (
    <Focusable
      label={ANCHOR_FACE[state].label}
      ring={false}
      focusScale={1}
      onPress={onPress}
      sv={anchorButton}
    >
      {({ focused, hovered }) => (
        <Icon
          name={ANCHOR_FACE[state].glyph}
          size={ANCHOR_GLYPH}
          color={anchorInk(state, focused || hovered)}
        />
      )}
    </Focusable>
  );
}

/** The address of a section on this document, or nothing off the web. */
function sectionHref(id: string): string | undefined {
  const at = webWindow()?.location;
  return at ? `${at.origin}${at.pathname}${at.search}#${id}` : undefined;
}

const ANCHOR_GLYPH = 15;

const anchorButton = sv({
  base: { p: space[1], radius: 'sm', _hover: { bg: 'white/6' }, _focus: { bg: 'white/6' } },
});

export { SectionAnchor };
