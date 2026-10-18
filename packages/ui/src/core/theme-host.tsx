import { Fragment, type ReactNode } from 'react';
import type { StyleRuntime } from './style-runtime';

/** Native styles resolve against context; there is no CSS host to publish to. */
export function ThemeHost({
  children,
}: {
  runtime: StyleRuntime;
  themeScope?: boolean;
  children?: ReactNode;
}) {
  return <Fragment>{children}</Fragment>;
}
