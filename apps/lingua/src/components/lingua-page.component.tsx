import { PageMain } from '@kromatv/ui/kit';
import { Box, Column } from '@kromatv/ui/kit/atoms/box';
import type { ReactNode } from 'react';
import { LinguaFooter } from '#site/components/lingua-footer.component';
import { LinguaHeader } from '#site/components/lingua-header.component';

/** A Lingua page: the header, then `children` in one centred column with the app's rhythm, then the footer. */
export function LinguaPage({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Box bg="bg" minH="100%">
      <LinguaHeader />
      <Box grow={1}>
        <PageMain>
          <Box px={16} pt={{ base: 20, md: 28 }} pb={56}>
            <Column gap={24} w="100%" maxW={1080} mx="auto">
              {children}
            </Column>
          </Box>
        </PageMain>
      </Box>
      <LinguaFooter />
    </Box>
  );
}
