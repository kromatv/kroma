import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Img } from '#ui/components/atoms/img';
import { stillArt } from '#ui/lib/sample-art';
import { DEFAULT_SUB_APPEARANCE, type SubEdge, type SubSize } from '../lib/subtitle-appearance';
import type { PlayerSub } from '../types';
import { SubtitleRenderer } from './SubtitleRenderer';

// The renderer fetches the track's url itself, and a `data:` url is a url — so the
// workbench gets actual cues instead of an empty caption area.
const CUES = `WEBVTT

00:00:00.000 --> 00:00:20.000
I've seen things you people wouldn't believe.

00:00:20.000 --> 00:00:40.000
Attack ships on fire off the shoulder of Orion.

00:00:40.000 --> 00:01:00.000
All those moments will be lost in time,
like tears in rain.
`;

const VTT = `data:text/vtt,${encodeURIComponent(CUES)}`;

const TRACK: PlayerSub[] = [
  { index: 0, language: 'eng', label: 'English', codec: 'webvtt', url: VTT, selectable: true },
];

export default story({
  name: 'SubtitleRenderer',
  group: 'Player',
  docs: "One position-driven subtitle renderer for the browser AND the television. It fetches the active track's WebVTT itself and caches the parsed cues per url, because a cross-origin `<track>` element silently never loads its cues when the app and the media server are on different origins — which is the normal case for a self-hosted server. Position is interpolated locally between the player's updates, so the caption changes on the frame it should rather than up to 250ms late.",
  usage: `<SubtitleRenderer
  positionSec={controller.cur}
  playing={controller.playing}
  seekNonce={seekNonce}
  subtitles={controller.subtitles}
  activeIndex={controller.subtitleIndex}
  appearance={appearance}
  raised={chromeVisible}
/>`,
  guidelines: {
    do: [
      'Bump `seekNonce` on every seek so the cue search re-syncs instead of scanning forward.',
      'Pass `raised` while the chrome is up, or the caption sits under the controls.',
    ],
    dont: [
      "Don't render it for a picture track (PGS/VobSub): those are not text and `selectable` says so.",
    ],
  },
  matrix: false,
  // A range, because line length is the design: at the narrow end the same cue set
  // wraps to three lines, which is where `box` starts covering the picture.
  width: { min: 560, max: 1100 },
  viewport: 'tv',
  args: {
    positionSec: 8,
    playing: false,
    raised: false,
    backdrop: 'still' as 'still' | 'bright' | 'black',
    size: 'md' as SubSize,
    edge: 'shadow' as SubEdge,
    opacity: 100,
  },
  controls: {
    backdrop: ['still', 'bright', 'black'],
    positionSec: { min: 0, max: 58, step: 1 },
    size: ['sm', 'md', 'lg', 'xl'],
    edge: ['none', 'shadow', 'outline', 'box'],
    opacity: { min: 20, max: 100, step: 5 },
  },
  render: ({ positionSec, playing, raised, size, edge, opacity, backdrop }) => (
    <Box aspect={16 / 9} bg="#000000" radius="lg" overflow="hidden" justify="flex-end">
      {/* Over black every setting looks fine, which is why it is the wrong
          background to judge them on: `bright` is the hard case. */}
      {backdrop === 'black' ? null : (
        <Img
          src={stillArt(backdrop === 'bright' ? 4 : 1)}
          fill
          fit="cover"
          alt=""
          style={backdrop === 'bright' ? BRIGHT : undefined}
        />
      )}
      <SubtitleRenderer
        positionSec={positionSec}
        playing={playing}
        subtitles={TRACK}
        activeIndex={0}
        appearance={{ ...DEFAULT_SUB_APPEARANCE, size, edge, opacity }}
        raised={raised}
      />
    </Box>
  ),
  scenes: [
    {
      name: 'Shadow on a bright frame',
      docs: 'The failure case: a drop shadow has nothing to sit against, and the line goes soft.',
      args: { edge: 'shadow', backdrop: 'bright', positionSec: 25 },
    },
    {
      name: 'Boxed on a bright frame',
      docs: 'The same frame with `box`: readable, which is why it is the accessibility choice.',
      args: { edge: 'box', size: 'lg', backdrop: 'bright', positionSec: 25 },
    },
    {
      name: 'Outline',
      docs: 'The middle ground — an edge on the glyphs themselves, no box.',
      args: { edge: 'outline', size: 'lg', positionSec: 45 },
    },
    {
      name: 'Raised',
      docs: 'Lifted clear of the controls while the chrome is visible.',
      args: { raised: true, positionSec: 45 },
    },
  ],
});

// The sample stills are cinematic and dark; this lifts one into the range a snow /
// daylight scene sits in.
const BRIGHT = { opacity: 0.95, filter: 'brightness(2.4) saturate(0.9)' } as const;
