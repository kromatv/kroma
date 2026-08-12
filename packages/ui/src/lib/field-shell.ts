// THE control shell: the one well every input wears.
//
// A form puts a text entry, a select trigger, a segmented control and a search
// box on the same row, and they have to read as one family: the same corner,
// the same edge, the same fill, the same height. So the metrics are declared
// ONCE here and every control derives from them, rather than each component
// carrying its own padding and radius that drift apart the moment one is
// tuned. A one-line TextArea being exactly a TextField tall is the same rule
// applied twice.
//
// Three sizes, because three form factors read at three distances: `sm` is the
// density a console page wants, `md` a phone held in the hand, `tv` a screen
// read across a room. A shell that knows which it is states it once with
// `setEntryDefaults` rather than at every call site.

import type { TextStyle } from 'react-native';
import { activeTheme, type ColorValue, type RadiusToken, radiusValue, styles } from '#ui/core';

type ControlSize = 'sm' | 'md' | 'tv';

interface ControlMetrics {
  /** The well's fill. Every control wears it: a filled segmented control
   *  beside a transparent select is the difference that reads as "these are
   *  two different kinds of thing".
   *
   *  Translucent, so a control over artwork (the sign-in screens over their
   *  splash) takes a hint of what is behind it. Every control that wears this
   *  fill also lays a <Frost> under it, so what shows through is BLURRED: the
   *  hint is depth, not a legible picture, and a grid of keys still reads as
   *  one surface rather than one colour per key. */
  bg: `${ControlFill}`;
  /** Corner, by NAME: a px number baked in here at module load would not follow
   *  a theme. Use {@link controlRadius} where the number itself is needed. */
  radius: RadiusToken;
  px: number;
  py: number;
  /** The content row's height: what a control's own content measures. */
  line: number;
  /** The control's outer height: the number every control on a row targets,
   *  whatever it is made of (an entry's padding, a button's label, a square
   *  icon button). Derived: border + py + line + py + border. */
  height: number;
  fontSize: number;
  /** Gap between a leading glyph, the content and a trailing slot. */
  gap: number;
}

const CONTROL_FILL = 'surface2/72' as const;
type ControlFill = typeof CONTROL_FILL;

/** The shape of every input, per size. Read it rather than re-deriving it:
 *  this table IS the design. */
export const CONTROL: Record<ControlSize, ControlMetrics> = {
  sm: {
    bg: CONTROL_FILL,
    radius: 'md',
    px: 14,
    py: 9,
    line: 20,
    height: 40,
    fontSize: 13.5,
    gap: 10,
  },
  md: {
    bg: CONTROL_FILL,
    radius: '2xl',
    px: 22,
    py: 12,
    line: 24,
    height: 50,
    fontSize: 16,
    gap: 14,
  },
  /** The ten-foot one. A television screen is read across a room and driven by
   *  a D-pad, so the well is taller and the ink larger than anything a pointer
   *  needs - the same step <Button> and <OtpField> already take with their own
   *  `tv` size. The corner is a keyboard key's, so a field and the grid under
   *  it read as one family rather than two. */
  tv: {
    bg: CONTROL_FILL,
    radius: '2xl',
    px: 26,
    py: 18,
    line: 30,
    height: 68,
    fontSize: 20,
    gap: 16,
  },
};

/** A control's corner in px, against the ACTIVE theme. Read it at render time:
 *  a value copied out at module load keeps the theme it was read under. */
export function controlRadius(metrics: ControlMetrics): number {
  return radiusValue(metrics.radius);
}

/**
 * One slot table per size, built from {@link CONTROL} rather than transcribed.
 * A control that changes shape with `size` writes the mapping ONCE and gets
 * every size, so adding a size is an entry in the table above and nothing else.
 * Before this, `sm` and `md` were hand-copied into five recipes and the
 * fourth size would have been five more clones.
 */
export function bySize<T>(build: (metrics: ControlMetrics) => T): Record<ControlSize, T> {
  return Object.fromEntries(
    Object.entries(CONTROL).map(([size, metrics]) => [size, build(metrics)]),
  ) as Record<ControlSize, T>;
}

/**
 * The face every KEY wears: the keypad's and the on-screen keyboard's alike.
 * A keyboard and a keypad are the same object at two scales, so the well, the
 * edge, the lift, the cursor wash and the amber under focus are declared here
 * once; a copy in each component is how the two grids drifted into a solid
 * amber fill on one and a tint on the other. Each grid still owns its own
 * geometry (the keypad's 88x72, the keyboard's per-size box and corner).
 *
 * It lives here rather than beside either component because <Keypad> is a
 * molecule and <Key> an organism, so neither may import the other, the same
 * reason lib/group-shape.ts exists.
 */
export const keyFace = {
  root: {
    center: true,
    // The same well a field sits in, opaque: a key is a control, not a wash.
    // Over artwork a translucent tint let every key sample whatever was behind
    // it, so one keyboard arrived in six colours. The hairline edge and the
    // lift are what keep a key off the artwork at all.
    bg: CONTROL.md.bg,
    border: 'border',
    shadow: 'card',
    // A key under the cursor lifts its own wash rather than borrowing the
    // amber, which is reserved for where focus is. Focus is the kit's ring,
    // the same one a tile and a row wear, over a wash that says which key it
    // is from across the room; the edge stays a hairline, since an amber one
    // under an amber ring reads as two rings around one key. Going down takes
    // the lit step of that amber, so a press reads as a press and not as focus
    // arriving again.
    _hover: { bg: 'surface3' },
    _focus: { bg: 'accentSoft' },
    _press: { bg: 'accentSoftHover', border: 'accentHover' },
  },
  label: { color: 'text', fontWeight: '700', _focus: { color: 'accentText' } },
  glyph: { color: 'text', stroke: 1.8, _focus: { color: 'accentText' } },
} as const;

/** The field's edge, which focus does NOT recolour: the ring outside it already
 * says where the focus is, and an amber edge under an amber ring reads as two
 * rings around one control. Invalid still speaks, since it says something the
 * ring does not. */
export function edgeColor(_focused: boolean, invalid: boolean): string {
  const { colors } = activeTheme();
  return invalid ? colors.danger : colors.borderStrong;
}

/** A focused field wears the same amber ring as every other control, rather
 *  than a 1px edge recolour: a field is a focus target like any other and has
 *  to read as one from three metres. */
const shell = styles({ ring: { ring: 'focusLift' } });

export function fieldRing(): TextStyle {
  return shell.ring;
}

/**
 * What an entry paints for itself, and what it drops when the shell belongs to
 * something else: the well of an <InputGroup>, the row of a command palette.
 * A flattened entry that kept drawing its own fill, edge, corner, lift and ring
 * paints a second set of all five over the parent's, and its rounded rectangle
 * shows through as the seam where the addons begin and end.
 *
 * Both <TextField> and <TextArea> read it, so the answer to "what does flat
 * mean" is in one place rather than two that drift.
 */
export function fieldShell(
  metrics: ControlMetrics,
  at: Readonly<{ flat: boolean; focused: boolean; invalid: boolean; lift?: boolean }>,
): { box: Record<string, unknown>; edge: TextStyle | null } {
  if (at.flat) return { box: { radius: 0, bg: 'transparent', borderWidth: 0 }, edge: null };
  return {
    box: {
      radius: metrics.radius,
      bg: metrics.bg,
      borderWidth: 1,
      // The fill is translucent, so a lift is what keeps the field off the
      // artwork. Only <TextField> asks for it; a textarea sits in a form.
      ...(at.lift ? { shadow: 'card' } : null),
    },
    edge: {
      borderColor: edgeColor(at.focused, at.invalid),
      ...(at.focused ? fieldRing() : null),
    } as TextStyle,
  };
}

/** The ink of a field that has not been filled in, as a token rather than a
 *  resolved colour: a value taken at module load keeps the ground it was read
 *  under, which on a native light theme is near-white on cream. */
export const PLACEHOLDER: ColorValue = 'text/30';

// What an app's controls default to. Per-site props still win; this is only so
// a shell that KNOWS its form factor (the web console is a mouse-and-keyboard
// page at arm's length) says so once at startup instead of at every call site.
let entryPhysicalKeyboard = false;
let entrySize: ControlSize = 'md';

/** Shell-level defaults for the kit's inputs. Call once at startup. */
export function setEntryDefaults(
  defaults: Readonly<{ physicalKeyboard?: boolean; size?: ControlSize }>,
): void {
  if (defaults.physicalKeyboard !== undefined) entryPhysicalKeyboard = defaults.physicalKeyboard;
  if (defaults.size !== undefined) entrySize = defaults.size;
}

export function entryDefaultPhysicalKeyboard(): boolean {
  return entryPhysicalKeyboard;
}

export function entryDefaultSize(): ControlSize {
  return entrySize;
}

/** The metrics for a size, defaulting to the shell's. */
export function controlMetrics(size?: ControlSize): ControlMetrics {
  return CONTROL[size ?? entrySize];
}

/** Web only, and `none` rather than width 0: Chrome's own focus ring is
 * `outline-style: auto`, which ignores the width - the field kept its blue
 * browser ring inside the kit's amber one until the STYLE was cleared. React
 * Native's types don't know `none` (native has no outline at all), hence the
 * cast. */
export const NO_OUTLINE = { outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle;

export type { ControlMetrics, ControlSize };
