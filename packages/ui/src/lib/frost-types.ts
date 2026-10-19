import type { ComponentType, ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { StyleScope } from '#ui/core';
import type { FrostSourceValue } from './frost-source';

/** What a registered platform blur must accept - expo-blur's <BlurView> as it
 * stands, so a shell registers the component itself, unconfigured. */
export interface FrostBackdropProps {
  /** Platform blur strength, 0-100 (expo-blur's scale). */
  intensity?: number;
  /** Open string union: expo-blur's tint set is wider than the three the kit
   *  asks for, and the registered component must remain assignable. */
  tint?: 'light' | 'dark' | 'default' | (string & {});
  style?: StyleProp<ViewStyle>;
}

export interface FrostOptions {
  /** False renders the surface untouched, so a caller that is only sometimes
   *  glass states the condition rather than branching around the coat.
   *  Defaults to true. */
  on?: boolean;
  /** Blur strength in CSS px; the platform intensity is derived from it. */
  amount?: number;
  /** Defaults to the ground the app is on. Pass it only for a surface that holds
   *  one ground whatever the app chose, the way the player's chrome stays dark.
   *  Native only: a browser coat has no tint of its own. */
  tint?: 'light' | 'dark' | 'default';
}

/** The two halves of a frost. Spread `style` onto the surface's own style list
 *  and render `layer` as its first child; exactly one of them is ever set. */
export interface FrostCoat {
  style: ViewStyle | null;
  layer: ReactNode;
}

/** Everything a platform needs to choose a coat. */
export interface FrostInput {
  surface: StyleProp<ViewStyle>;
  options: FrostOptions;
  platform: ComponentType<FrostBackdropProps> | null;
  sampled: boolean;
  source: FrostSourceValue | null;
  scope: StyleScope;
}

export const BARE: FrostCoat = { style: null, layer: null };
