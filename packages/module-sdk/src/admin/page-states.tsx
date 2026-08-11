// What a module page shows before it has anything to show. A console page
// arrives in two steps - the module's code, then its data - and both used to
// render as a bare line of text (or, worse, as nothing at all). These are the
// shared answers, so a module page is never a black screen and every one of
// them waits the same way.

import { useT } from '@kroma/ui';
import { Box, Button, CardSkeleton, EmptyState, Skeleton } from '@kroma/ui/kit';
import type { ViewStyle } from 'react-native';

/**
 * The shape of a console page, pulsing: a title, a subtitle, and the panels
 * under them. Deliberately the page's OWN silhouette rather than a spinner -
 * it says what is coming and holds the layout, so nothing jumps when the real
 * page lands.
 */
export function ModuleLoading({ panels = 2 }: Readonly<{ panels?: number }>) {
  const t = useT();
  return (
    <Box gap={24} accessibilityLabel={t('common.loading')} aria-busy>
      <Box gap={10}>
        <Skeleton h={34} w={260} radius={8} />
        <Skeleton h={16} w={360} bg="white/4" />
      </Box>
      {Array.from({ length: panels }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder panels
        <CardSkeleton key={i} fields={i === 0 ? 3 : 2} />
      ))}
    </Box>
  );
}

/** A module that is not installed, or has been turned off: its pages vanish
 *  with its nav, and this says so rather than 404-ing. */
export function ModuleUnavailable() {
  const t = useT();
  return (
    <Box style={PAGE}>
      <EmptyState.Root
        layout="fill"
        icon="plug-off"
        title={t('modules.unavailable')}
        hint={t('modules.unavailableHint')}
      />
    </Box>
  );
}

/** A module page whose own data could not be fetched. Distinct from
 *  {@link ModuleUnavailable}: the module IS there, the request failed. Pass
 *  `retry` where the page can ask again, and the state offers the button. */
export function ModuleFailed({ retry, detail }: Readonly<{ retry?: () => void; detail?: string }>) {
  const t = useT();
  return (
    <Box style={PAGE}>
      <EmptyState.Root
        layout="fill"
        icon="alert-triangle"
        title={t('modules.loadFailed')}
        hint={t('modules.loadFailedHint')}
        detail={detail}
        actions={
          retry ? (
            <Button
              variant="glass"
              size="sm"
              icon="refresh"
              label={t('error.retry')}
              onPress={retry}
            />
          ) : undefined
        }
      />
    </Box>
  );
}

// The console's main region does not stretch its children, so a state that
// should centre in the viewport has to bring its own height. The unit is the
// browser's; RN's types do not know it, and these pages render only there.
const PAGE = { minHeight: '62vh' } as unknown as ViewStyle;
