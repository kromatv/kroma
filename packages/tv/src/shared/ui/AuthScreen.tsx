import { useT } from '@kroma/ui';
import { BackButton, Box, colors, FocusScroll, gradient } from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import { useNav } from '#tv/app/router';

const BACKDROP = `radial-gradient(120% 90% at 50% 0%, #15131C, ${colors.bg} 68%)`;

/** The shared centred backdrop for the TV auth / connect / pin screens. The
 * pinned Back button self-hides at the signed-out root. */
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

const AUTH_SCROLL = { flex: 1 } as const;

// Growth and centring sit on the content, not the box, so it centres when it
// fits and scrolls from the top when it does not.
const AUTH_CONTENT = {
  flexGrow: 1,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  paddingHorizontal: 40,
  paddingVertical: 48,
};
