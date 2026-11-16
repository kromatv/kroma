import { Fragment } from 'react';
import type { ThemeHostProps } from './theme-host.types';

/** Native roots use context and need no extra layout view. */
export function ThemeHost({ children }: Readonly<ThemeHostProps>) {
  return <Fragment>{children}</Fragment>;
}
