import { Box, classes, Logo, styles, useStyles } from '@kromatv/ui/kit';
import type { ReactNode } from 'react';
import { PAGE_RADIAL } from '#web/shared/ui';

const sDefinition = styles({
  screen: {
    position: 'fixed',
    inset: 0,
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    paddingInline: 24,
    paddingBlock: 48,
    backgroundImage: PAGE_RADIAL,
  },
});

/** The full-screen frame of a page a person reaches without a session: the
 * logo, then the page's own content, centred and scrollable on a short
 * viewport. */
export function PublicScreen({ children }: Readonly<{ children: ReactNode }>) {
  const s = useStyles(sDefinition);
  return (
    <main className={classes(s.screen)}>
      <Box w="100%" align="center" m="auto">
        <Box mb={40}>
          <Logo size={24} />
        </Box>
        {children}
      </Box>
    </main>
  );
}
