import type { CardSection } from '@kromatv/client/media';
import { RankedRail } from '#tv/features/catalog/home/ranked-rail.component';
import { SectionRail } from '#tv/features/catalog/home/section-rail.component';
import { SpotlightBand } from '#tv/features/catalog/home/spotlight-band.component';
import type { HeldTitle } from '#tv/features/catalog/title-menu.hook';

interface HomeSectionProps {
  section: CardSection;
  onHold: (title: HeldTitle) => void;
}

/** One home section below the hero, drawn the way its layout asks. Any layout
 * without a shape of its own here is a rail. */
export function HomeSection({ section, onHold }: Readonly<HomeSectionProps>) {
  if (section.layout === 'ranked') {
    return <RankedRail section={section} onHold={onHold} />;
  }
  if (section.layout === 'spotlight') {
    return <SpotlightBand section={section} onHold={onHold} />;
  }
  return <SectionRail section={section} onHold={onHold} />;
}
