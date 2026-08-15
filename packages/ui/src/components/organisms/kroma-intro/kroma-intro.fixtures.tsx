import { useState } from 'react';

import { Box } from '#ui/components/atoms/box';

import { Button } from '#ui/components/atoms/button';

import { Text } from '#ui/components/atoms/text';

import { WEB } from '#ui/lib/platform';

import { Portal } from '#ui/lib/portal';

import { KromaIntro } from './kroma-intro';

export // A source no decoder will take, so the story reaches the CSS fallback through
// the real error path rather than past the component's own API.
const UNDECODABLE = 'data:video/mp4;base64,AAAA';

export interface StageProps {
  tagline: string;
  lite: boolean;
  loop: boolean;
  breakVideo?: boolean;
}

export // The intro cannot render inside the canvas: its shell is `position: fixed` over
// the whole viewport, with sound. So the story is a launcher.
function Stage({ tagline, lite, loop, breakVideo }: Readonly<StageProps>) {
  const [playing, setPlaying] = useState(false);

  if (!WEB) {
    return (
      <Box gap={8}>
        <Text variant="label">Not this platform</Text>
        <Text variant="meta" color="textDim">
          {'`KromaIntro` renders `null` here by design: the film is a <video> element and the '}
          {'fallback is CSS keyframes. This client plays the same film through `expo-video` in '}
          {'its own shell - see `packages/tv/src/app/BrandIntro.tsx`.'}
        </Text>
      </Box>
    );
  }

  return (
    <Box gap={16}>
      <Box gap={6}>
        <Text variant="label">Takes over the viewport</Text>
        <Text variant="meta" color="textDim">
          Full screen, with sound. Enter, Space or Escape skips - the keys a remote sends - and `r`
          restarts the choreography. It also ends itself with the sting, so it hands back even if
          playback stalls.
        </Text>
      </Box>
      <Button
        label={breakVideo ? 'Play the CSS scene' : 'Play the film'}
        icon="player-play"
        variant={breakVideo ? 'outline' : 'primary'}
        onPress={() => setPlaying(true)}
      />
      {playing && (
        // The workbench renders a story inside a scaled device frame, and that
        // transform would become the `position: fixed` film's containing block.
        <Portal>
          <KromaIntro
            onDone={() => setPlaying(false)}
            tagline={tagline || undefined}
            lite={lite}
            loop={loop}
            videoSrc={breakVideo ? UNDECODABLE : undefined}
          />
        </Portal>
      )}
    </Box>
  );
}
