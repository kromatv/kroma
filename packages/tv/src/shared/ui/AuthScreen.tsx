// The shared radial backdrop for the TV auth / connect / pin screens.

import { useT } from '@kroma/ui';
import { BackButton, Box, colors, FocusScroll, gradient } from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import { useNav } from '#tv/app/router';

const BACKDROP = `radial-gradient(120% 90% at 50% 0%, #15131C, ${colors.bg} 68%)`;

/** The shared centred backdrop for the auth / connect / pin screens. Scrolling
 * lives on the outer element and the content centres in an inner wrapper that
 * grows to fill it, so it sits centred when it fits but scrolls from the top
 * (never clipping the title) when the content is taller than the screen. A
 * pinned Back button (mouse users) sits top-left on any pushed screen; it
 * self-hides at the signed-out root (the profile picker). */
export function AuthScreen({ children }: Readonly<{ children: ReactNode }>) {
  const nav = useNav();
  const t = useT();
  return (
    <Box fill z={10} style={gradient(BACKDROP)}>
      <FocusScroll style={AUTH_SCROLL} contentStyle={AUTH_CONTENT}>
        {children}
      </FocusScroll>
      {nav.canGoBack ? (
        <Box absolute left={32} top={28} z={20}>
          <BackButton onPress={nav.back} label={t('common.back')} />
        </Box>
      ) : null}
    </Box>
  );
}

/** The page scroller's own box: the navigator scrolls it to follow focus. */
const AUTH_SCROLL = { flex: 1 } as const;

/** The content centres when it fits and scrolls from the top when it does not,
 * which is why the growth and the centring are on the CONTENT, not the box. */
const AUTH_CONTENT = {
  flexGrow: 1,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  paddingHorizontal: 40,
  paddingVertical: 48,
};
