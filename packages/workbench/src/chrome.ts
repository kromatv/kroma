// The handful of style constants every piece of workbench chrome shares.
//
// They lived in whichever file happened to need them first - `FOCUS_WASH` in
// the toolbar, imported by the panel and the shell; `RULE` written out four
// times; the tab shape twice - so the one constant meant to keep the chrome
// consistent was being bypassed by re-declaration. Nothing here belongs to a
// particular surface, so nothing here lives in one.

import { colors, radius } from '@kroma/ui/tokens';

/** The hairline between two bands of chrome, on the band's bottom edge. */
export const RULE = { borderBottomWidth: 1, borderBottomColor: colors.border } as const;

/** The same hairline on the TOP edge, for a band that sits under what it divides
 * itself from: the sidebar footer, the panel dock, the shell's code bar. Written
 * out four separate times before it was named. */
export const RULE_TOP = { borderTopWidth: 1, borderTopColor: colors.border } as const;

/** The hover/focus wash. Every focusable piece of chrome takes it, which is what
 * makes "this responds to the pointer" one treatment rather than several. */
export const FOCUS_WASH = { backgroundColor: 'rgba(255, 255, 255, 0.06)' } as const;

/** The same wash, a notch up, for a row in an open MENU - where the surface
 * underneath is already lifted and the plain wash reads as nothing at all. */
export const FOCUS_WASH_STRONG = { backgroundColor: 'rgba(255, 255, 255, 0.07)' } as const;

/**
 * The shape a tab takes, shared by the canvas's tabs and the inspector's.
 *
 * It is the shape the WASH and the underline both fill, which is why it is
 * padded away from its label and square at the bottom: that is where it meets
 * the rule the active underline sits on. Without the horizontal padding the wash
 * is a rectangle clamped to the text.
 *
 * The two tab rows lay their contents out differently (one has an icon and a
 * count, the other a demo dot), so the CONTENT is each one's own - but a tab
 * that is a different size in the two of them is just a bug waiting to be seen.
 */
export const TAB = {
  paddingVertical: 11,
  paddingHorizontal: 12,
  marginBottom: -1,
  borderBottomWidth: 2,
  borderBottomColor: 'transparent',
  borderTopLeftRadius: radius.sm,
  borderTopRightRadius: radius.sm,
} as const;

export const TAB_ACTIVE = { borderBottomColor: colors.accent } as const;
