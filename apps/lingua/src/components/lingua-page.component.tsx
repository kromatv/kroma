import { PageMain } from '@kromatv/ui/kit';
import { Box, Column } from '@kromatv/ui/kit/atoms/box';
import type { ReactNode } from 'react';
import { LinguaFooter } from '#site/components/lingua-footer.component';
import { LinguaHeader } from '#site/components/lingua-header.component';
import { useSite } from '#site/lib/use-site.hook';
import type { Viewer } from '#site/lib/views';

/** A Lingua page: the header, then `children` in one centred column, then the footer. */
export function LinguaPage({
  viewer,
  children,
}: Readonly<{ viewer: Viewer | null; children: ReactNode }>) {
  const site = useSite();
  return (
    <Box bg="bg" minH="100%">
      <LinguaHeader viewer={viewer} />
      <Box grow={1}>
        <PageMain>
          <Box px={16} py={28}>
            <Column gap={24} w="100%" maxW={1080} mx="auto">
              {children}
            </Column>
          </Box>
        </PageMain>
      </Box>
      {site ? <LinguaFooter origin={site.origin} /> : null}
    </Box>
  );
}
