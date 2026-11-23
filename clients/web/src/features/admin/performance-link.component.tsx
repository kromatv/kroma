import type { ViewProps } from 'react-native';
import { opening, type PerfSearch } from '#web/features/admin/performance-tabs';
import { RouteLink } from '#web/shared/ui/route-link.component';

/** A link that keeps the Performance page where it is and opens one drawer
 *  over the one already open. Forwards what a row's `asChild` hands it. */
export function PerfLink({ open, ...rest }: Readonly<ViewProps & { open: PerfSearch }>) {
  return (
    <RouteLink
      {...rest}
      from="/admin/performance"
      to="/admin/performance"
      search={(prev) => opening(prev, open)}
    />
  );
}
