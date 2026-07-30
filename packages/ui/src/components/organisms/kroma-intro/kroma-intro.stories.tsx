import { story } from '@kroma/workbench/story';
import { useState } from 'react';
import { Platform } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Txt } from '#ui/components/atoms/text';
import { Portal } from '#ui/lib/portal';
import { KromaIntro } from './kroma-intro';

// A source no decoder will take, so the story reaches the CSS fallback through
// the real error path rather than past the component's own API.
const UNDECODABLE = 'data:video/mp4;base64,AAAA';

interface StageProps {
  tagline: string;
  lite: boolean;
  loop: boolean;
  breakVideo?: boolean;
}

// The intro cannot render inside the canvas: its shell is `position: fixed` over
// the whole viewport, with sound. So the story is a launcher.
function Stage({ tagline, lite, loop, breakVideo }: Readonly<StageProps>) {
  const [playing, setPlaying] = useState(false);

  if (Platform.OS !== 'web') {
    return (
      <Box gap={8}>
        <Txt variant="label">Not this platform</Txt>
        <Txt variant="meta" color="textDim">
          {'`KromaIntro` renders `null` here by design: the film is a <video> element and the '}
          {'fallback is CSS keyframes. This client plays the same film through `expo-video` in '}
          {'its own shell - see `packages/tv/src/app/BrandIntro.tsx`.'}
        </Txt>
      </Box>
    );
  }

  return (
    <Box gap={16}>
      <Box gap={6}>
        <Txt variant="label">Takes over the viewport</Txt>
        <Txt variant="meta" color="textDim">
          Full screen, with sound. Enter, Space or Escape skips - the keys a remote sends - and `r`
          restarts the choreography. It also ends itself with the sting, so it hands back even if
          playback stalls.
        </Txt>
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

export default story({
  name: 'KromaIntro',
  group: 'Brand',
  docs: 'The brand film every client opens with: a chromatic light tunnel landing on the KR-wheel-MA lockup, full-screen with sound. It ships as **4K60 HEVC only** - fitting for an HEVC-first product - and anything without a hardware decoder falls back to a pure-CSS scene that needs no codec at all.\n\nIt is a DOM component, deliberately: a real `<video>`, `document` visibility handling, and inline styles rather than a framework so it renders identically on the SSR shell and on a 2016 TV webview. **On native it renders `null`** - the Apple TV and phone clients play the same film through `expo-video` in their own shell, which is why this story is a note rather than a film in the native workbench.',
  usage: `{showIntro && <KromaIntro onDone={() => setShowIntro(false)} />}`,
  guidelines: {
    do: [
      'Mount it as a full-screen overlay and let `onDone` hand off to the app - it ends itself if playback stalls.',
      'Reach for `lite` on a weak TV GPU: the CSS fallback then stays compositor-only.',
    ],
    dont: [
      "Don't add controls or a visible skip button - any key already skips, and the film is five seconds long.",
      "Don't expect sound from the first frame: browsers block autoplay-with-sound until a gesture, so it starts muted and unmutes on the first one.",
    ],
  },
  matrix: false,
  // No device frame: the film takes the whole window through a portal, so the
  // width is only the note's measure.
  width: { min: 320, max: 620 },
  args: {
    tagline: '',
    lite: false,
    loop: false,
  },
  render: ({ tagline, lite, loop }) => (
    <Stage tagline={String(tagline ?? '')} lite={Boolean(lite)} loop={Boolean(loop)} />
  ),
  scenes: [
    {
      name: 'The CSS fallback',
      docs: 'What a browser with no HEVC decoder sees: the same choreography drawn with keyframes and no video at all. This mounts it with a deliberately undecodable source, so it arrives here through the same play()-rejection path a real codec failure takes. The scene to check when tuning for a slow panel (`lite`).',
      render: ({ tagline, lite, loop }) => (
        <Stage
          breakVideo
          tagline={String(tagline ?? '')}
          lite={Boolean(lite)}
          loop={Boolean(loop)}
        />
      ),
    },
    {
      name: 'With a tagline',
      docs: 'A tagline fades in over the final seconds of the film. There is none by default: it ends on the bare lockup.',
      args: { tagline: 'Everything you own, everywhere you are.' },
    },
  ],
});
