import { type ComponentType, createContext, useContext } from 'react';
import type { FrostBackdropProps } from '#ui/components/atoms/frost';
import type { DeviceStore } from './device-store';
import type { ControlSize } from './field-shell';
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
  surfaces: SurfacePresentation;
  image: ImageBackend | null;
  frost: ComponentType<FrostBackdropProps> | null;
}
const DEFAULTS: KitSettings = Object.freeze({
  deviceStore: undefined,
  menuKeys: null,
  scrollLock: null,
  entry: Object.freeze({ physicalKeyboard: false, size: 'md' }),
  surfaces: 'auto',
  frostEnabled: true,
  image: null,
  frost: null,
});
export const KitSettingsContext = createContext<KitSettings>(DEFAULTS);
export function useKitSettings() {
  return useContext(KitSettingsContext);
}
