import type { ReactNode } from 'react';
import { I18nManager } from 'react-native';
import { DirectionContext } from './direction';

interface DirectionRootProps {
  locale: string;
  children: ReactNode;
}

/** Tells the tree which way its layout runs. React Native lays out by
 *  `I18nManager`, which the app's language does not set yet, so that is what
 *  the tree is told. */
export function DirectionRoot({ children }: Readonly<DirectionRootProps>) {
  const dir = I18nManager.getConstants().isRTL ? 'rtl' : 'ltr';
  return <DirectionContext value={dir}>{children}</DirectionContext>;
}
