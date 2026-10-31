import { type ComponentType, createContext, useContext } from 'react';
import type { FrostBackdropProps } from '#ui/components/atoms/frost';
import type { DeviceStore } from './device-store';
import type { ControlSize } from './field-shell';
import type { FrostHost } from './gl-frost/host';
import type { ImageBackend } from './image-backend';
import type { createMenuKeys } from './menu-keys';
import type { createScrollLock } from './scroll-lock';
import type { SurfacePresentation } from './surface-presentation';

interface KitSettings {
  deviceStore: DeviceStore | null | undefined;
  menuKeys: ReturnType<typeof createMenuKeys> | null;
  scrollLock: ReturnType<typeof createScrollLock> | null;
  entry: Readonly<{ physicalKeyboard: boolean; size: ControlSize }>;
  frostEnabled: boolean;
  frostLayerOnly: boolean;
  veilBitmap: boolean;
  surfaces: SurfacePresentation;
  image: ImageBackend | null;
  frost: ComponentType<FrostBackdropProps> | null;
  frostHost: FrostHost | null;
}
const DEFAULTS: KitSettings = Object.freeze({
  deviceStore: undefined,
  menuKeys: null,
  scrollLock: null,
  entry: Object.freeze({ physicalKeyboard: false, size: 'md' }),
  surfaces: 'auto',
  frostEnabled: true,
  frostLayerOnly: false,
  veilBitmap: true,
  image: null,
  frost: null,
  frostHost: null,
});
export const KitSettingsContext = createContext<KitSettings>(DEFAULTS);
export function useKitSettings() {
  return useContext(KitSettingsContext);
}
