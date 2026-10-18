import {
  type ComponentType,
  createElement,
  type ReactElement,
  type ReactNode,
  useMemo,
} from 'react';
import type { FrostBackdropProps } from './components/atoms/frost';
import { applyMode, setTheme, type Theme, type ThemeMode } from './core';
import type { ControlSize } from './lib/field-shell';
import type { ImageBackend } from './lib/image-backend';
import { KitSettingsContext, useKitSettings } from './lib/kit-settings';
import type { SurfacePresentation } from './lib/surface-presentation';

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

/** Prepare immutable root configuration and apply the initial theme, if given.
 * Pass the result to KitProvider; capability defaults belong to that tree. */
export function configureKit<P extends FrostBackdropProps = FrostBackdropProps>(
  config: Readonly<KitConfig<P>>,
): Readonly<KitConfig<P>> {
  if (config.ground) applyMode(config.ground);
  if (config.theme) setTheme(config.theme);
  return Object.freeze({ ...config });
}

const EMPTY = Object.freeze({});
/** Supplies root defaults; nested providers inherit unspecified capabilities. */
export function KitProvider<P extends FrostBackdropProps = FrostBackdropProps>({
  config = EMPTY,
  children,
}: {
  config?: Readonly<KitConfig<P>>;
  children?: ReactNode;
}): ReactElement {
  const parent = useKitSettings();
  const value = useMemo(() => {
    const preset = config.formFactor && FORM_FACTOR[config.formFactor];
    return {
      entry: { ...parent.entry, ...preset?.entry, ...config.entry },
      surfaces: config.surfaces ?? preset?.surfaces ?? parent.surfaces,
      image: config.image ?? parent.image,
      frost: (config.frost ?? parent.frost) as ComponentType<FrostBackdropProps> | null,
    };
  }, [parent, config]);
  return createElement(KitSettingsContext.Provider, { value }, children);
}
