// The whole button design, declared once: fills, paddings and label metrics as
// `sv` slots rather than conditionals and parallel lookup maps at the call site.

import type { IconProps } from '#ui/components/atoms/icon';
import { type StyleDecl, svFor, type Variant } from '#ui/core';
import { CONTROL } from '#ui/lib/field-shell';

// The row's rhythm, shared by the root and the dimmable content wrapper.
const CONTENT_GAP = 9;

const buttonVariants = svFor<{
  root: StyleDecl;
  label: StyleDecl;
  icon: Pick<IconProps, 'color' | 'size'>;
}>()({
  slots: {
    // Disabled is NOT a root opacity: an element with opacity < 1 becomes its
    // own backdrop root, which blinds the <Frost> child's backdrop-filter.
    // Each variant fades its FILL below instead, and the content row carries
    // the ink dim (a group fade, so icon strokes never double-paint).
    root: { row: true, center: true, gap: CONTENT_GAP, radius: 'md' },
    label: { text: 'label' },
    icon: { color: 'text', size: 20 },
  },
  variants: {
    variant: {
      primary: {
        root: {
          bg: 'accent',
          _hover: { bg: 'accentHover' },
          _press: { bg: 'accentPress' },
          _disabled: { bg: 'accent/50' },
        },
        label: { color: 'accentInk' },
        icon: { color: 'accentInk' },
      },
      glass: {
        root: {
          bg: 'tint/10',
          border: 'borderStrong',
          _hover: { bg: 'tint/18', borderColor: 'tint/30' },
          _press: { bg: 'tint/26', borderColor: 'tint/38' },
          _disabled: { bg: 'tint/5', border: 'tint/7' },
        },
      },
      ghost: {
        root: { bg: 'transparent', _hover: { bg: 'tint/10' }, _press: { bg: 'tint/18' } },
      },
      danger: {
        root: {
          bg: 'danger',
          _hover: { bg: 'dangerHover' },
          _press: { bg: 'dangerPress' },
          _disabled: { bg: 'danger/50' },
        },
      },
      /** Red ink, no fill: the destructive action that is an exit rather than
       *  the screen's purpose (a dialog's "Delete" beside its primary pair). */
      dangerGhost: {
        root: { bg: 'transparent', _hover: { bg: 'danger/14' }, _press: { bg: 'danger/24' } },
        label: { color: 'danger' },
        icon: { color: 'danger' },
      },
      /** A dark wash for a control floating OVER artwork it must not brighten
       *  (a skip-intro pill, an overlay's quiet action). */
      scrim: {
        root: {
          bg: 'bg/70',
          border: 'tint/15',
          _hover: { bg: 'bg/80', borderColor: 'tint/26' },
          _press: { bg: 'bg/88', borderColor: 'tint/34' },
          _disabled: { bg: 'bg/35', border: 'tint/7' },
        },
      },
      /** A bordered toggle: the detail screen's "Ma liste" / "Vu" pills, which
       *  read as pressed rather than as a primary action: the edge carries the
       *  state, and the fill stays a whisper. */
      outline: {
        root: {
          bg: 'tint/4',
          border: 'borderStrong',
          _hover: { bg: 'tint/12', borderColor: 'tint/34' },
          _press: { bg: 'tint/20', borderColor: 'tint/44' },
          _disabled: { bg: 'tint/3', border: 'tint/8' },
        },
      },
    },
    active: { true: {} },
    size: {
      sm: {
        root: { py: CONTROL.sm.py, px: 16, minH: CONTROL.sm.height, radius: CONTROL.sm.radius },
        label: { fontSize: 13, fontWeight: '600', lineHeight: CONTROL.sm.line },
        icon: { size: 16 },
      },
      md: {
        root: { py: CONTROL.md.py, px: 28, minH: CONTROL.md.height, radius: CONTROL.md.radius },
        label: { fontSize: 16, fontWeight: '700', lineHeight: CONTROL.md.line },
        icon: { size: 20 },
      },
      lg: {
        root: { py: 17, px: 38 },
        label: { fontSize: 19, fontWeight: '700' },
        icon: { size: 22 },
      },
      /** The 10-foot primary action (the home hero, a detail screen's Lecture).
       *  From the table like the rest, so a tv button beside a tv field is the
       *  same height and the same corner rather than approximately both. */
      tv: {
        root: { py: CONTROL.tv.py, px: 40, minH: CONTROL.tv.height, radius: CONTROL.tv.radius },
        label: { fontSize: CONTROL.tv.fontSize, fontWeight: '700', lineHeight: CONTROL.tv.line },
        icon: { size: 22 },
      },
    },
    block: { true: { root: { self: 'stretch' } } },
  },
  compound: [
    {
      when: { variant: 'outline', active: true },
      style: {
        root: {
          bg: 'accentSoft',
          borderColor: 'accentWash/45',
          _hover: { bg: 'accentSoftHover', borderColor: 'accentWash/60' },
          _press: { bg: 'accentSoftHover', borderColor: 'accentWash/75' },
        },
        label: { color: 'accentText' },
        icon: { color: 'accentText' },
      },
    },
  ],
  defaults: { variant: 'primary', size: 'md', block: false, active: false },
});

type ButtonVariant = Variant<typeof buttonVariants, 'variant'>;
type ButtonSize = Variant<typeof buttonVariants, 'size'>;

// The variants whose fill is a translucency over whatever sits behind, the
// ones a backdrop blur has anything to do for.
const FROSTED = new Set<ButtonVariant>(['glass', 'outline', 'scrim']);

// The variants with no fill at rest: disabling one leaves nothing to frost,
// where every other variant fades its fill translucent and frosts behind it.
const UNFILLED = new Set<ButtonVariant>(['ghost', 'dangerGhost']);

export type { ButtonSize, ButtonVariant };
export { buttonVariants, CONTENT_GAP, FROSTED, UNFILLED };
