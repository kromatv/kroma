import { synopsisLead } from '@kromatv/core';
import type { CardSection } from '@kromatv/client/media';
import { useT } from '@kromatv/ui';
import {
  Box,
  colors,
  Focusable,
  gutter,
  Icon,
  Img,
  styles,
  Text,
  tintGradient,
  useStyles,
  Veil,
} from '@kromatv/ui/kit';
import { useClient } from '#tv/app/router';
import { entryBackdrop, entryId, entryMetadata } from '#tv/features/catalog/home/sectionEntry';
import { useHomeTile } from '#tv/features/catalog/home/use-home-tile';
import type { HeldTitle } from '#tv/features/catalog/TitleMenu';

const SPOTLIGHT_HEIGHT = 360;
const SYNOPSIS_BUDGET = 170;
const SPOTLIGHT_ART_W = 1280;
const SPOTLIGHT_VEIL = `linear-gradient(90deg, ${colors.bg} 8%, transparent 72%)`;

const sDefinition = styles({
  band: { radius: '2xl' },
  frame: {
    minH: SPOTLIGHT_HEIGHT,
    radius: '2xl',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  copy: { pl: 48, py: 40, maxWidth: 760 + 48, gap: 10 },
});

interface SpotlightBandProps {
  section: CardSection;
  onHold: (title: HeldTitle) => void;
}

/** A home section that is one title given the width of the page: its art, why
 * it was picked and what it is about, as a single control. */
export function SpotlightBand({ section, onHold }: Readonly<SpotlightBandProps>) {
  const s = useStyles(sDefinition);

  const client = useClient();
  const t = useT();
  const tileOf = useHomeTile(onHold);
  const entry = section.items[0];
  if (!entry) return null;
  const tile = tileOf(entry);
  const note = section.notes[entryId(entry)];
  const synopsis = synopsisLead(entryMetadata(entry)?.overview, SYNOPSIS_BUDGET);

  return (
    <Box px={gutter.tv} mt={26} mb={16}>
      <Focusable
        label={tile.title}
        onPress={tile.onPress}
        onLongPress={tile.onLongPress}
        focusScale={1.02}
        style={s.band}
      >
        <Box style={s.frame}>
          <Img
            src={entryBackdrop(entry, client, SPOTLIGHT_ART_W)}
            background={tintGradient(tile.tint)}
            position="50% 25%"
            fill
            noCrossFade
          />
          <Veil ramp={SPOTLIGHT_VEIL} />
          <Box style={s.copy}>
            <Text variant="overlineTv" color="accentText">
              {section.title}
            </Text>
            <Text variant="titleTv" lines={1}>
              {tile.title}
            </Text>
            {note ? (
              <Text variant="labelTv" color="textMuted">
                {note}
              </Text>
            ) : null}
            {synopsis ? (
              <Text variant="bodyTv" color="text/82">
                {synopsis}
              </Text>
            ) : null}
            <Box row align="center" gap={6} mt={6}>
              <Text variant="strongTv" color="accentText">
                {t('content.seeDetails')}
              </Text>
              <Icon name="chevron-right" size={20} color="accentText" />
            </Box>
          </Box>
        </Box>
      </Focusable>
    </Box>
  );
}
