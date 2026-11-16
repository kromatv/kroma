import { Box, Column } from '@kromatv/ui/kit/atoms/box';
import { Skeleton } from '@kromatv/ui/kit/atoms/skeleton';
import { LinguaPage } from '#site/components/lingua-page.component';

const ROWS = ['a', 'b', 'c', 'd', 'e'];

/** What a page shows while its data is on the way: its header and a list, sketched. */
export function PagePending() {
  return (
    <LinguaPage>
      <Column gap={10} accessibilityLabel="Loading" aria-busy>
        <Skeleton w={160} h={14} />
        <Skeleton w={280} h={34} />
        <Skeleton shape="text" variant="body" lines={1} />
      </Column>
      <Box bg="surface1" border="border" radius="xl" overflow="hidden">
        {ROWS.map((row) => (
          <Box key={row} px={16} py={16} gap={8}>
            <Skeleton w={180} h={16} />
            <Skeleton w="60%" h={10} />
          </Box>
        ))}
      </Box>
    </LinguaPage>
  );
}
