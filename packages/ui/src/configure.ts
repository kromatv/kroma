import {
  type ComponentType,
  createElement,
  Fragment,
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { FrostBackdropProps } from './components/atoms/frost';
import type { Theme, ThemeMode } from './core';
import { StyleRuntimeProvider, useStyleRuntimeParent } from './core/style-context';
import {
  createStyleRuntime,
  type StyleRuntime,
  type StyleRuntimeOptions,
} from './core/style-runtime';
import { ThemeHost } from './core/theme-host';
import type { DeviceStore } from './lib/device-store';
import type { ControlSize } from './lib/field-shell';
import { createFocusServices } from './lib/focus-services';
import { FocusServicesProvider, useFocusServicesParent } from './lib/focus-services-context';
import type { ImageBackend } from './lib/image-backend';
import { createInputGate, InputGateProvider, useInputGateParent } from './lib/input-gate';
import { createInputSource, InputSourceProvider, useInputSourceParent } from './lib/input-source';
import { KitSettingsContext, useKitSettings } from './lib/kit-settings';
import { createMenuKeys } from './lib/menu-keys';
import { createScrollLock } from './lib/scroll-lock';
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
  designWidth?: number;
  remote?: boolean;
  deviceStore?: DeviceStore | null;
  frostEnabled?: boolean;
  entry?: Partial<EntryDefaults>;
  surfaces?: SurfacePresentation;
  ground?: ThemeMode;
  theme?: Theme;
  image?: ImageBackend;
  frost?: ComponentType<P>;
}

/** Prepare immutable root configuration. The mounted provider applies it.
 * Pass the result to KitProvider; capability defaults belong to that tree. */
export function configureKit<P extends FrostBackdropProps = FrostBackdropProps>(
  config: Readonly<KitConfig<P>>,
): Readonly<KitConfig<P>> {
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

  const inheritedInput = useInputSourceParent();
  const [ownedInput] = useState(createInputSource);
  const input = inheritedInput ?? ownedInput;
  useEffect(() => input.retain(), [input]);
  const inheritedGate = useInputGateParent();
  const [ownedGate] = useState(createInputGate);
  const inheritedFocus = useFocusServicesParent();
  const [ownedFocus] = useState(() =>
    createFocusServices(config.remote ?? false, inheritedGate ?? ownedGate, input),
  );
  const focus = config.remote === undefined ? (inheritedFocus ?? ownedFocus) : ownedFocus;
  const [menuKeys] = useState(createMenuKeys);
  const [scrollLock] = useState(createScrollLock);
  const value = useMemo(() => {
    const preset = config.formFactor && FORM_FACTOR[config.formFactor];
    return {
      deviceStore: config.deviceStore === undefined ? parent.deviceStore : config.deviceStore,
      menuKeys: parent.menuKeys ?? menuKeys,
      scrollLock: parent.scrollLock ?? scrollLock,
      entry: { ...parent.entry, ...preset?.entry, ...config.entry },
      surfaces: config.surfaces ?? preset?.surfaces ?? parent.surfaces,
      frostEnabled: config.frostEnabled ?? parent.frostEnabled,
      image: config.image ?? parent.image,
      frost: (config.frost ?? parent.frost) as ComponentType<FrostBackdropProps> | null,
    };
  }, [parent, config, scrollLock, menuKeys]);
  return createElement(
    FocusServicesProvider,
    { value: focus },
    createElement(
      InputSourceProvider,
      { value: input },
      createElement(
        InputGateProvider,
        { value: inheritedGate ?? ownedGate },
        createElement(
          KitSettingsContext.Provider,
          { value },
          createElement(KitStyleProvider, { config }, children),
        ),
      ),
    ),
  );
}

/** Ownership changes remount only this explicit styling boundary. */
function KitStyleProvider({
  config,
  children,
}: Readonly<{ config: Readonly<StyleRuntimeOptions>; children?: ReactNode }>): ReactElement {
  const parent = useStyleRuntimeParent();
  const ownsTheme = !parent || config.theme !== undefined || config.ground !== undefined;
  const ownsWidth = !parent || config.designWidth !== undefined;
  if (!ownsTheme && !ownsWidth) return createElement(Fragment, null, children);
  return createElement(
    OwnedKitStyleProvider,
    { key: `${ownsTheme}:${ownsWidth}`, config, parent: parent ?? undefined },
    children,
  );
}
function OwnedKitStyleProvider({
  config,
  parent,
  children,
}: Readonly<{
  config: Readonly<StyleRuntimeOptions>;
  parent?: StyleRuntime;
  children?: ReactNode;
}>): ReactElement {
  const [runtime] = useState(() => createStyleRuntime(config, parent));
  useEffect(() => runtime.breakpoints.retain(), [runtime]);
  useEffect(() => {
    if (config.ground && config.ground !== runtime.mode()) runtime.setMode(config.ground);
  }, [config.ground, runtime]);
  useEffect(() => {
    if (config.theme) runtime.theme.setTheme(config.theme);
  }, [config.theme, runtime]);
  useEffect(() => {
    if (config.designWidth !== undefined) runtime.breakpoints.pinDesignWidth(config.designWidth);
  }, [config.designWidth, runtime]);
  return createElement(
    StyleRuntimeProvider,
    { runtime },
    createElement(ThemeHost, { runtime, themeScope: runtime.theme !== parent?.theme }, children),
  );
}
