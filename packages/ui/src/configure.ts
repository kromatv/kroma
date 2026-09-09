import type { ComponentType } from 'react';
import { type FrostBackdropProps, registerFrost } from './components/atoms/frost';
import { applyMode, setTheme, type Theme, type ThemeMode } from './core';
import { type ControlSize, setEntryDefaults } from './lib/field-shell';
import { type ImageBackend, setImageBackend } from './lib/image-backend';
import { type SurfacePresentation, setSurfacePresentation } from './lib/surface-presentation';

/**
 * How far the reader sits and what they type with. Every consequence follows
 * from that one word, so a shell states it once instead of restating each:
 *
 * - `tv` is the kit's own default. A field is a value with a caret, typing
 *   arrives from an on-screen keyboard, and controls are sized for a room.
 * - `phone` has a real keyboard, so a field focuses a real entry and summons
 *   the IME, and an anchored surface opens as a sheet because a handset has no
 *   room beside a trigger for a panel.
 * - `browser` is the same keyboard at arm's length, at console density, with
 *   surfaces left to the platform: a panel under a pointer.
 */
export type FormFactor = 'tv' | 'phone' | 'browser';

type EntryDefaults = Readonly<{ physicalKeyboard: boolean; size: ControlSize }>;

const FORM_FACTOR: Readonly<
  Record<FormFactor, { entry: EntryDefaults; surfaces: SurfacePresentation }>
> = {
  tv: { entry: { physicalKeyboard: false, size: 'tv' }, surfaces: 'auto' },
  phone: { entry: { physicalKeyboard: true, size: 'md' }, surfaces: 'dialog' },
  browser: { entry: { physicalKeyboard: true, size: 'sm' }, surfaces: 'auto' },
};

export interface KitConfig<P extends FrostBackdropProps = FrostBackdropProps> {
  formFactor?: FormFactor;
  entry?: Partial<EntryDefaults>;
  surfaces?: SurfacePresentation;
  ground?: ThemeMode;
  theme?: Theme;
  image?: ImageBackend;
  frost?: ComponentType<P>;
}

/**
 * Everything the kit holds a default for that only the app knows the answer to,
 * stated in one call at module scope, before the first render.
 *
 * ```ts
 * configureKit({
 *   formFactor: 'phone',
 *   ground: readMode(),
 *   theme: mobileTheme(),
 *   image: expoImageBackend,
 *   frost: BlurView,
 * });
 * ```
 *
 * An absent key leaves the kit's own default standing; `entry` and `surfaces`
 * override the form factor for a shell that is not quite one of the three.
 * `image` and `frost` are inversions: a shell that registers neither gets React
 * Native's `<Image>` and a flat wash instead of glass.
 *
 * Every underlying setter is still exported, for the rare change made after the
 * first render rather than before it.
 */
export function configureKit<P extends FrostBackdropProps = FrostBackdropProps>(
  config: Readonly<KitConfig<P>>,
): void {
  const preset = config.formFactor && FORM_FACTOR[config.formFactor];
  if (preset) {
    setEntryDefaults(preset.entry);
    setSurfacePresentation(preset.surfaces);
  }
  if (config.entry) setEntryDefaults(config.entry);
  if (config.surfaces) setSurfacePresentation(config.surfaces);
  if (config.ground) applyMode(config.ground);
  if (config.theme) setTheme(config.theme);
  if (config.image) setImageBackend(config.image);
  if (config.frost) registerFrost(config.frost);
}
