import { type RadiusToken, sv } from '#ui/core';
import { CONTROL } from '#ui/lib/field-shell';

type OtpSize = 'md' | 'tv';

// <Frost> clips itself to the corner rather than inheriting it, so the radius
// each size gives its slot has to be stated where the frost can read it too.
const SLOT_RADIUS = { md: 'lg', tv: 'xl' } as const satisfies Record<OtpSize, RadiusToken>;

const otpVariants = sv({
  slots: {
    slot: { center: true, bg: CONTROL.md.bg, border: 'borderStrong' },
    char: { fontWeight: '600', color: 'text' },
  },
  variants: {
    size: {
      md: { slot: { w: 52, h: 60, radius: SLOT_RADIUS.md }, char: { fontSize: 26 } },
      tv: { slot: { w: 72, h: 84, radius: SLOT_RADIUS.tv }, char: { fontSize: 38 } },
    },
    /** `active` is the slot the next character lands in, and the only one with a caret. */
    state: {
      empty: {},
      filled: {},
      active: { slot: { borderColor: 'accent', bg: 'accentSoft' } },
    },
    /** Dimmed by colour, never by a row `opacity`: fading the row would fade
     *  the FROST with it and let the backdrop through as a legible picture.
     *  The well keeps its fill and only the edge and the ink recede. Declared
     *  before `invalid` so a lockout keeps its red edge. */
    disabled: {
      true: { slot: { borderColor: 'border' }, char: { color: 'textDim' } },
    },
    invalid: {
      true: { slot: { borderColor: 'danger' } },
    },
  },
  compound: [
    // A rejected code keeps its red edge even under the caret, so the field
    // does not look like it has forgotten the error the moment it is retried.
    {
      when: { state: 'active', invalid: true },
      style: { slot: { borderColor: 'danger' } },
    },
  ],
  defaults: { size: 'md', state: 'empty', disabled: false, invalid: false },
});

export type { OtpSize };
export { otpVariants, SLOT_RADIUS };
