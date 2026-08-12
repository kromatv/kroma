import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { IconButton } from '#ui/components/atoms/icon-button';
import { Img } from '#ui/components/atoms/img';
import { Text } from '#ui/components/atoms/text';
import { stillArt } from '#ui/lib/sample-art';
import { DEFAULT_SUB_APPEARANCE } from './lib/subtitle-appearance';
import type { SubtitleGenBundle } from './parts/settings-panel/settings/gen';
import { Player } from './player';
import { CHAPTERS, fakeController } from './player.fixture';
import type { PlayerFlags } from './types';

const WEB: PlayerFlags = { volume: true, pip: true, fullscreen: true, pointer: true };
const TV: PlayerFlags = { volume: false, pip: false, fullscreen: false, pointer: false };

const NO_GEN: SubtitleGenBundle = {
  canCreate: false,
  caps: null,
  pending: [],
  onCancel: () => {},
  onDelete: () => {},
  onStart: () => {},
};

const UP_NEXT = {
  nextEpisodes: [0, 1, 2].map((at) => ({
    id: `ep-${at}`,
    title: `Episode ${at + 2}`,
    subtitle: `S1 E${at + 2}`,
    posterUrl: stillArt(at),
    categoryLabel: 'Episode',
  })),
  recommendations: [3, 4, 5].map((at) => ({
    id: `rec-${at}`,
    title: `Recommendation ${at}`,
    subtitle: '2021',
    posterUrl: stillArt(at),
    categoryLabel: 'Science fiction',
  })),
};

function Surface() {
  return <Img src={stillArt(1)} fill fit="cover" />;
}

export default story({
  name: 'Player',
  group: 'Player',
  docs: "The whole chrome, assembled. `Player.Root` owns no playback of its own: it is handed a **`PlayerController`** and a `<Player.Media>`, and everything it draws (the top bar, the chapter bar, the transport, the panels, the up-next sheet) reads from that one object. That is what lets the same component draw over four different decoders (an in-page `<video>` on the web; AVPlay, mpv or ExoPlayer rendering to a native plane *behind* a transparent page on the televisions). `flags` is the other half: a TV has no volume slider, no PiP and no fullscreen, so those controls are absent rather than disabled. The three slots are `Media` (the picture), `Actions` (the host's own top-bar controls) and `Panel` (a notice that takes the stage over and locks the chrome); any other child is drawn over the chrome as it stands.",
  usage: `<Player.Root
  controller={controller}
  flags={WEB_FLAGS}
  title={item.title}
  chapters={chapters}
  tileAt={storyboard.tileAt}
  appearance={appearance}
  onAppearanceChange={setAppearance}
  subtitleGen={subtitleGen}
  upNext={upNext}
  onClose={({ reason }) => leave(reason)}
>
  <Player.Media>
    <video ref={videoRef} />
  </Player.Media>
</Player.Root>`,
  guidelines: {
    do: [
      'Pass the platform `flags` (`WEB_FLAGS` / `TV_FLAGS`) rather than branching inside a screen.',
      'Hand it a controller: the chrome must never reach for the video element itself.',
      'Give it the whole stage: it measures itself and sizes its chrome to what it gets.',
      "Read `reason` on `onClose`: `back` is the remote, `close` the chrome's own control.",
    ],
    dont: [
      "Don't render two - it owns the remote, the key handling and the fullscreen element.",
      "Don't wrap it in a fixed-width box: the chrome would size itself for a stage it isn't on.",
      "Don't wrap <Player.Media> in a box of your own: the surface must stay a direct child of the stage.",
    ],
  },
  matrix: false,
  // Authored against the 1920x1080 stage; the chrome still measures whatever
  // frame it is drawn on, so the phone and tablet frames stay meaningful.
  viewport: 'tv',
  pad: 0,
  args: {
    playing: false as boolean,
    warn: '',
    tv: false as boolean,
    intro: false as boolean,
    actions: false as boolean,
    stopped: false as boolean,
  },
  render: ({ playing, warn, tv, intro, actions, stopped }) => (
    <Box flex bg="#000000" overflow="hidden">
      <Player.Root
        controller={fakeController({ playing })}
        flags={tv ? TV : WEB}
        title="Blade Runner 2049"
        subtitle="2017 · 2 h 44"
        warn={warn ? String(warn) : null}
        chapters={CHAPTERS}
        tileAt={() => null}
        appearance={DEFAULT_SUB_APPEARANCE}
        onAppearanceChange={() => {}}
        subtitleGen={NO_GEN}
        upNext={UP_NEXT}
        introActive={intro}
        onSkipIntro={intro ? () => {} : undefined}
        onClose={() => {}}
      >
        <Player.Media>
          <Surface />
        </Player.Media>
        {actions ? (
          <Player.Actions>
            <IconButton icon="device-tv" label="Play on TV" variant="ghost" size={42} />
          </Player.Actions>
        ) : null}
        {stopped ? (
          <Player.Panel>
            <Box fill z={80} center gap={16} px={64} bg="black/92">
              <Text variant="headingTv" textAlign="center" color="white">
                Playback stopped
              </Text>
              <Text variant="bodyTv" textAlign="center" maxW={672} color="text/72">
                An administrator ended this session.
              </Text>
            </Box>
          </Player.Panel>
        ) : null}
      </Player.Root>
      <Box absolute bottom={8} left={12}>
        <Text variant="meta" color="textDim">
          Nothing is playing: the controller is a fixture, so the transport shows state without a
          film behind it.
        </Text>
      </Box>
    </Box>
  ),
  scenes: [
    {
      name: 'Playing',
      docs: 'The transport in its other state; the chrome auto-hides over a real film.',
      args: { playing: true },
    },
    {
      name: 'Television',
      docs: 'TV_FLAGS: no volume slider, no PiP, no fullscreen. A TV has none of them.',
      args: { tv: true },
    },
    {
      name: 'With a warning',
      docs: 'The pill that says the stream is not what was asked for.',
      args: { warn: 'Transcoding: this device cannot direct-play HEVC' },
    },
    {
      name: 'Skip intro',
      docs: 'The pill sits on top of the transport, measured against it, including the 150px the up-next peek lifts the whole bottom chrome by. Narrow the frame and it stays clear of the seek bar at every width.',
      args: { intro: true },
    },
    {
      name: 'Host actions',
      docs: 'A <Player.Actions> child lands at the end of the top bar, after the warning pill: the web\'s "play on TV". A television passes none: it is the screen a film is cast TO.',
      args: { actions: true, warn: 'Transcoding: this device cannot direct-play HEVC' },
    },
    {
      name: 'Stopped',
      docs: 'A <Player.Panel> takes the stage over and LOCKS the chrome: the picture stops taking presses, the spinner stays down, and Back / OK both mean leave.',
      args: { stopped: true },
    },
  ],
});
