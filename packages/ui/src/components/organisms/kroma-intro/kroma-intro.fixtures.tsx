import { useState } from 'react';

import { Box } from '#ui/components/atoms/box';

import { Button } from '#ui/components/atoms/button';

import { Text } from '#ui/components/atoms/text';

import { DomOnly } from '#ui/lib/dom-only.component';

import { Portal } from '#ui/lib/portal.component';

import { KromaIntro } from './kroma-intro.component';

export interface StageProps {
  tagline: string;
  loop: boolean;
}

export // The intro cannot render inside the canvas: its shell is `position: fixed` over
// the whole viewport, with sound. So the story is a launcher.
function Stage({ tagline, loop }: Readonly<StageProps>) {
  const [playing, setPlaying] = useState(false);

  const elsewhere = (
    <Box gap={8}>
      <Text variant="label">Not this platform</Text>
      <Text variant="meta" color="textDim">
        {'`KromaIntro` renders `null` here by design: the film is a <video> element. This '}
        {'client plays the same film through `expo-video`, in `NativeFilm` '}
        {'(`packages/ui/src/lib/native-film.component.tsx`).'}
      </Text>
    </Box>
  );

  return (
    <DomOnly fallback={elsewhere}>
      <Box gap={16}>
        <Box gap={6}>
          <Text variant="label">Takes over the viewport</Text>
          <Text variant="meta" color="textDim">
            Full screen, with sound. Enter, Space or Escape skips (the keys a remote sends) and `r`
            restarts the film. It also ends itself with the film, so it hands back even if playback
            stalls.
          </Text>
        </Box>
        <Button
          label="Play the film"
          icon="player-play"
          variant="primary"
          onPress={() => setPlaying(true)}
        />
        {playing && (
          // The workbench renders a story inside a scaled device frame, and that
          // transform would become the `position: fixed` film's containing block.
          <Portal>
            <KromaIntro
              onDone={() => setPlaying(false)}
              tagline={tagline || undefined}
              loop={loop}
            />
          </Portal>
        )}
      </Box>
    </DomOnly>
  );
}
