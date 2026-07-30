import type { ReactNode } from 'react';

// `lg` is the closing block's roomier inset. Kept as whole class strings rather
// than composed at runtime so Tailwind still sees them.
const pads = { md: 'p-6 sm:p-7', lg: 'p-8 sm:p-10' } as const;

export interface PanelProps {
  children: ReactNode;
  pad?: keyof typeof pads;
}

/** The one card shell of the install page: hairline border on the raised surface.
 *  Server options, family entries and the closing block are all this, so they
 *  cannot drift apart. */
export function Panel({ children, pad = 'md' }: Readonly<PanelProps>) {
  return (
    <div
      className={`surface-hairline rounded-2xl border border-border bg-surface-1/40 ${pads[pad]}`}
    >
      {children}
    </div>
  );
}
