import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import { type FocusCardProps, FocusCard as PlainCard } from './focus-card-fallback';

export type { FocusCardProps } from './focus-card-fallback';

/** Whether this build draws the native focus card. */
export const HAS_FOCUS_CARD = requireOptionalNativeModule('FocusCard') !== null;

/** The lift, tilt and light of a tvOS card over a focused navigator control, all moved by the system. */
export const FocusCard: ComponentType<FocusCardProps> = HAS_FOCUS_CARD
  ? requireNativeView<FocusCardProps>('FocusCard')
  : PlainCard;
