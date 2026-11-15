import { posterColors } from '@kromatv/core';
import {
  ArtScrim,
  Box,
  color,
  Focusable,
  motion,
  Progress,
  styles,
  Text,
  useStyles,
  VirtualRail,
} from '@kromatv/ui/kit';
import { memo, useState } from 'react';
import {
  entryBackdrop,
  entryId,
  entryTitle,
  type HomeEntry,
  type HomeSection,
} from '#web/features/catalog/home/entries';
import { entryLink } from '#web/features/catalog/home/entry-link';
import { useAuth } from '#web/shared/lib/auth';
import { Image } from '#web/shared/ui';

const CARD_W = 320;
const GAP = 18;
const PAD = 12;
const CARD_H = Math.round((CARD_W * 9) / 16);

const sDefinition = styles({
  rail: { height: CARD_H + PAD * 2 },
  content: { py: PAD },
  hit: { w: '100%', radius: 'xl' },
  lift: {
    transitionProperty: 'transform',
    transitionDuration: `${motion.duration.base}ms`,
  },
  lifted: { transform: [{ translateY: motion.focusLift }] },
  art: {
    aspect: 16 / 9,
    radius: 'xl',
    overflow: 'hidden',
    outlineStyle: 'solid',
    outlineWidth: 3,
    outlineColor: 'transparent',
    transitionProperty: 'outline-color',
    transitionDuration: `${motion.duration.base}ms`,
  },
  artLit: { outlineColor: color('accent') },
  caption: { position: 'absolute', left: 14, right: 14, bottom: 14 },
  progress: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});

interface WideFaceProps {
  entry: HomeEntry;
  note?: string;
  hovered: boolean;
}

function WideCaption({ entry, note }: Readonly<{ entry: HomeEntry; note?: string }>) {
  const s = useStyles(sDefinition);

  return (
    <Box style={s.caption}>
      {note ? (
        <Text variant="overline" color="accent" lines={1} mb={4}>
          {note}
        </Text>
      ) : null}
      <Text variant="label" lines={1}>
        {entryTitle(entry)}
      </Text>
    </Box>
  );
}

function WideFace({ entry, note, hovered }: Readonly<WideFaceProps>) {
  const s = useStyles(sDefinition);
  const { client } = useAuth();
  const progress = entry.type === 'show' ? (entry.show.progress ?? null) : null;

  return (
    <Box style={[s.art, hovered ? s.artLit : null]}>
      <Image
        src={entryBackdrop(client, entry, CARD_W * 2)}
        background={`linear-gradient(158deg, ${posterColors(entryId(entry)).join(', ')})`}
        fit="cover"
        position="center 24%"
        fill
      />
      <ArtScrim variant="deep" />
      <WideCaption entry={entry} note={note} />
      {progress === null ? null : (
        <Box style={s.progress}>
          <Progress value={progress / 100} thickness={4} rounded={false} />
        </Box>
      )}
    </Box>
  );
}

const WideCard = memo(function WideCard({
  entry,
  note,
}: Readonly<{ entry: HomeEntry; note?: string }>) {
  const s = useStyles(sDefinition);
  const [hovered, setHovered] = useState(false);

  return (
    <Box
      w="100%"
      maxW={CARD_W}
      self="center"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <Box style={hovered ? [s.lift, s.lifted] : s.lift}>
        <Focusable label={entryTitle(entry)} style={s.hit} asChild>
          {entryLink(entry, <WideFace entry={entry} note={note} hovered={hovered} />)}
        </Focusable>
      </Box>
    </Box>
  );
});

/** A row of landscape cards, each with room for the line the server says
 * about it ("3 new episodes"). */
export function WideRail({ section }: Readonly<{ section: HomeSection }>) {
  const s = useStyles(sDefinition);
  return (
    <VirtualRail
      data={section.items}
      itemWidth={CARD_W + GAP}
      gap={GAP}
      style={s.rail}
      contentStyle={s.content}
      renderItem={(entry) => <WideCard entry={entry} note={section.notes[entryId(entry)]} />}
    />
  );
}
