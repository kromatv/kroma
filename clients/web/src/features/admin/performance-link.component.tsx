import type { ViewProps } from 'react-native';
import { type PerfSearch, urlId } from '#web/features/admin/performance-tabs';
import { RouteLink } from '#web/shared/ui/route-link.component';

/** A link that keeps the Performance page where it is and opens one drawer:
 *  the row it names replaces whichever was open. Forwards what a row's
 *  `asChild` hands it. */
export function PerfLink({ open, ...rest }: Readonly<ViewProps & { open: PerfSearch }>) {
  return (
    <RouteLink
      {...rest}
      from="/admin/performance"
      to="/admin/performance"
      search={(prev) => ({
        ...prev,
        scope: open.scope,
        segment: open.segment === undefined ? undefined : urlId(open.segment),
        slow: open.slow === undefined ? undefined : urlId(open.slow),
      })}
    />
  );
}
