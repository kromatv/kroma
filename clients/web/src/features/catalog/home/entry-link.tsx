import type { ReactElement, ReactNode } from 'react';
import type { HomeEntry } from '#web/features/catalog/home/entries';
import { RouteLink } from '#web/shared/ui/route-link';

/** The anchor to an entry's own page, as the one element a control rendered
 * `asChild` takes: `children` is what the control then draws inside it. */
export function entryLink(entry: HomeEntry, children?: ReactNode): ReactElement {
  return entry.type === 'show' ? (
    <RouteLink to="/shows/$id" params={{ id: entry.show.id }}>
      {children}
    </RouteLink>
  ) : (
    <RouteLink to="/movies/$id" params={{ id: entry.item.id }}>
      {children}
    </RouteLink>
  );
}
