import { type ComponentType, createContext, useContext } from 'react';
import type { FrostBackdropProps } from '#ui/components/atoms/frost';
import type { ControlSize } from './field-shell';
import type { ImageBackend } from './image-backend';
import type { SurfacePresentation } from './surface-presentation';

interface KitSettings {
  entry: Readonly<{ physicalKeyboard: boolean; size: ControlSize }>;
  frostEnabled: boolean;
  surfaces: SurfacePresentation;
  image: ImageBackend | null;
  frost: ComponentType<FrostBackdropProps> | null;
}
const DEFAULTS: KitSettings = Object.freeze({
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
