import type { ReactNode } from 'react';
import { NAVIGATED } from './control-platform';
import { WEB } from './platform';

/** Picks a control's form: the navigator node on a native television unless focus is controlled, the touch form elsewhere, and the cloned link where `asChild` can clone the host. */
export function controlForm({
  controlled,
  scoped,
  asChild,
  link,
  touch,
  navigator,
}: Readonly<{
  controlled: boolean;
  scoped: boolean;
  asChild: boolean;
  link: () => ReactNode;
  touch: () => ReactNode;
  navigator: () => ReactNode;
}>): ReactNode {
  if (!controlled && (scoped || NAVIGATED)) return navigator();
  return asChild && WEB ? link() : touch();
}
