import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Img } from '#ui/components/atoms/img';
import { Txt } from '#ui/components/atoms/text';
import { stillArt } from '#ui/lib/sample-art';
import { DEFAULT_SUB_APPEARANCE } from './lib/subtitle-appearance';
import { Player } from './Player';
import type { SubtitleGenBundle } from './parts/settings/gen';
import { fakeController } from './player.fixture';
import type { Chapter, PlayerFlags } from './types';

const WEB: PlayerFlags = { volume: true, pip: true, fullscreen: true, pointer: true };
const TV: PlayerFlags = { volume: false, pip: false, fullscreen: false, pointer: false };

const CHAPTERS: Chapter[] = [
  { startMs: 0, endMs: 96_000, title: 'Cold open', kind: 'intro' },
  { startMs: 96_000, endMs: 2_760_000, title: 'Act one', kind: 'chapter' },
  { startMs: 2_760_000, endMs: 5_940_000, title: 'Act two', kind: 'chapter' },
  { startMs: 5_940_000, endMs: 9_180_000, title: 'Act three', kind: 'chapter' },
  { startMs: 9_180_000, endMs: 9_840_000, title: 'Credits', kind: 'credits' },
];

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
    durationLabel: '54 min',
    categoryLabel: 'Episode',
  })),
  recommendations: [3, 4, 5].map((at) => ({
    id: `rec-${at}`,
    title: `Recommendation ${at}`,
    subtitle: '2021',
    posterUrl: stillArt(at),
    durationLabel: '2 h 12',
    categoryLabel: 'Science fiction',
  })),
};

function Surface() {
  return <Img src={stillArt(1)} fill fit="cover" />;
}

export default story({
  name: 'Player',
  group: 'Player',
  docs: 'The whole chrome, assembled. `Player` owns no playback of its own: it is handed a **`PlayerController`** and a `surface` node, and everything it draws — the top bar, the chapter bar, the transport, the panels, the up-next sheet — reads from that one object. That is what lets the same component draw over four different decoders (an in-page `<video>` on the web; AVPlay, mpv or ExoPlayer rendering to a native plane *behind* a transparent page on the televisions). `flags` is the other half: a TV has no volume slider, no PiP and no fullscreen, so those controls are absent rather than disabled.',
  usage: `<Player
  controller={controller}
  flags={WEB_FLAGS}
  title={item.title}
  chapters={chapters}
  tileAt={storyboard.tileAt}
  appearance={appearance}
  onAppearance={setAppearance}
  subtitleGen={subtitleGen}
  upNext={upNext}
  surface={<video ref={videoRef} />}
  onClose={leave}
/>`,
  guidelines: {
    do: [
      'Pass the platform `flags` (`WEB_FLAGS` / `TV_FLAGS`) rather than branching inside a screen.',
      'Hand it a controller: the chrome must never reach for the video element itself.',
      'Give it the whole stage: it measures itself and sizes its chrome to what it gets.',
    ],
    dont: [
      "Don't render two - it owns the remote, the key handling and the fullscreen element.",
      "Don't wrap it in a fixed-width box: the chrome would size itself for a stage it isn't on.",
    ],
  },
  matrix: false,
  // Authored against the 1920x1080 stage; the chrome still measures whatever
  // frame it is drawn on, so the phone and tablet frames stay meaningful.
  viewport: 'tv',
  pad: 0,
  args: { playing: false as boolean, warn: '', tv: false as boolean, intro: false as boolean },
  render: ({ playing, warn, tv, intro }) => (
    <Box flex bg="#000000" overflow="hidden">
      <Player
        controller={fakeController({ playing })}
        flags={tv ? TV : WEB}
        title="Blade Runner 2049"
        subtitle="2017 · 2 h 44"
        warn={warn ? String(warn) : null}
        chapters={CHAPTERS}
        tileAt={() => null}
        appearance={DEFAULT_SUB_APPEARANCE}
        onAppearance={() => {}}
        subtitleGen={NO_GEN}
        upNext={UP_NEXT}
        intro={intro ? { active: true, onSkip: () => {} } : undefined}
        surface={<Surface />}
        onClose={() => {}}
      />
      <Box absolute bottom={8} left={12}>
        <Txt variant="meta" color="textDim">
          Nothing is playing: the controller is a fixture, so the transport shows state without a
          film behind it.
        </Txt>
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
      docs: 'TV_FLAGS: no volume slider, no PiP, no fullscreen — a TV has none of them.',
      args: { tv: true },
    },
    {
      name: 'With a warning',
      docs: 'The pill that says the stream is not what was asked for.',
      args: { warn: 'Transcoding: this device cannot direct-play HEVC' },
    },
    {
      name: 'Skip intro',
      docs: 'The pill sits on top of the transport, measured against it — including the 150px the up-next peek lifts the whole bottom chrome by. Narrow the frame and it stays clear of the seek bar at every width.',
      args: { intro: true },
    },
  ],
});
