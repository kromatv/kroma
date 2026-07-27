// The KROMA brand lockup, from the design system.
//
// This file used to carry its own copy of the official export's outlines, which
// made it the THIRD place in the repo that knew what the wordmark looks like.
// It now renders @kroma/ui's <Logo>, so the phone, the TVs and the web draw the
// same lockup from the same path data.

import { Logo } from '@kroma/ui/kit';

export function KromaLockup({ height = 40 }: Readonly<{ height?: number }>) {
  return <Logo size={height} />;
}
