import { PageMain } from '@kromatv/ui/kit';
import { Box, Column } from '@kromatv/ui/kit/atoms/box';
import type { ReactNode } from 'react';
import { LinguaHeader } from '#site/components/lingua-header.component';
import type { Viewer } from '#site/lib/views';

/** A Lingua page: the header, then `children` in one centred column. */
export function LinguaPage({
  viewer,
  children,
}: Readonly<{ viewer: Viewer | null; children: ReactNode }>) {
  return (
    <Box bg="bg" minH="100%">
      <LinguaHeader viewer={viewer} />
      <PageMain>
        <Box px={16} py={28}>
          <Column gap={24} w="100%" maxW={1080} mx="auto">
            {children}
          </Column>
        </Box>
      </PageMain>
    </Box>
  );
}
