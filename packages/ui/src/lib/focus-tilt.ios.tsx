import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import { type FocusTiltProps, FocusTilt as FlatTilt } from './focus-tilt-fallback';

export type { FocusTiltProps } from './focus-tilt-fallback';

/** The focus parallax of an Apple TV poster: while `active`, the content tilts
 *  toward the thumb on the Siri Remote, natively and without a render per frame. */
export const FocusTilt: ComponentType<FocusTiltProps> = requireOptionalNativeModule('FocusTilt')
  ? requireNativeView<FocusTiltProps>('FocusTilt')
  : FlatTilt;
