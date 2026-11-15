// The page landmark, web (Tizen / webOS / desktop / browser): a real <main>.
//
// Every screen root is `position:fixed inset-0`, so this wrapper is
// layout-neutral (0-height in flow); it exists only to give assistive tech and
// Lighthouse the one <main> landmark a page is required to have.

import type { ReactNode } from 'react';

export const PageMain = ({ children }: { children: ReactNode }) => <main>{children}</main>;
