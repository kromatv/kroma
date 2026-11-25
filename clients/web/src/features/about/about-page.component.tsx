import buildInfo from 'virtual:build-info';
import { Box } from '@kromatv/ui/kit';
import { AboutHero } from '#web/features/about/about-hero.component';
import { AppCard, ServerCard } from '#web/features/about/build-cards.component';
import { LicensesCard } from '#web/features/about/licenses-card.component';
import { PrivacyCard } from '#web/features/about/privacy-card.component';
import { PageFrame } from '#web/shared/ui';

const COLUMN = 1040;
const CARD = 320;

/** About KROMA: what it is, the server and the client builds in use, what it
 * collects, and the open source code it ships. */
export function AboutPage() {
  return (
    <PageFrame pt={20}>
      <Box w="100%" maxW={COLUMN} self="center" gap={20}>
        <AboutHero info={buildInfo} />
        <Box row wrap gap={20}>
          <Box flex minW={CARD}>
            <ServerCard />
          </Box>
          <Box flex minW={CARD}>
            <AppCard info={buildInfo} />
          </Box>
        </Box>
        <PrivacyCard />
        <LicensesCard />
      </Box>
    </PageFrame>
  );
}
