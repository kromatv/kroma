import type { ReactNode } from 'react';
import type { StyleRuntime } from './style-runtime';

/** The browser publishes this scope; native uses its context without a host view. */
export interface ThemeHostProps {
  readonly runtime: StyleRuntime;
  readonly themeScope?: boolean;
  readonly children?: ReactNode;
}
