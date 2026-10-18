import type { ReactNode } from 'react';
import { useScopeMarks } from '#ui/core/scope-marks';

const CONTENTS = { display: 'contents' } as const;

/**
 * Re-stamps the nearest styling root's marks around content that renders
 * outside that root's element: a portal under `<body>`, a `<Modal>`'s own
 * container. Without it the content reads the document's ground and the
 * base breakpoint, whatever its root says.
 */
export function ScopeCarrier({ children }: Readonly<{ children: ReactNode }>) {
  const marks = useScopeMarks();
  if (!marks) return <>{children}</>;
  return (
    <div style={CONTENTS} {...marks}>
      {children}
    </div>
  );
}
