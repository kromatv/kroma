import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import { type FocusShieldProps, FocusShield as PlainShield } from './focus-shield';

export type { FocusShieldProps } from './focus-shield';

/** A View whose subtree the television's own focus search never walks. */
export const FocusShield: ComponentType<FocusShieldProps> = requireOptionalNativeModule(
  'FocusShield',
)
  ? requireNativeView<FocusShieldProps>('FocusShield')
  : PlainShield;
