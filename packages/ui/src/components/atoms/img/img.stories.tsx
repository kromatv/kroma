import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { tintGradient } from '#ui/components/molecules/media-card';
import { posterArt, stillArt } from '#ui/lib/sample-art';
import { Img } from './img';

// What the viewer sees for the first few hundred milliseconds, and what they
// keep seeing if the artwork never lands.
const TINT = tintGradient(['#3A2E4F', '#1B1524']);

export default story({
  name: 'Img',
  group: 'Media',
  docs: 'Every piece of artwork goes through here. The component owns the instant gradient, the fade-in on load and the cross-fade when the source changes; the decoder itself is injectable, which lets the mobile app use expo-image without touching the design.',
  usage: `<Img src={client.resolveArt(item.posterUrl)} background={tintGradient(item.tint)} radius={13} />`,
  guidelines: {
    do: [
      'Give it a `background` gradient: it is what fills the frame until the art lands.',
      'Pass `priority` on the ONE above-the-fold image of a screen, never on a rail tile.',
    ],
    dont: ["Don't rewrite the URL here - hand it art the server already sized."],
  },
  matrix: false,
  // The frame is given a RANGE and keeps 16:9 (see `render`), rather than being
  // pinned at 320x180: `cover` discarding more or less of the artwork as the box
  // changes size is the thing this story is for.
  width: { min: 240, max: 520 },
  // PORTRAIT art in a landscape frame, deliberately. `fit` and `position` only
  // do anything when the artwork and its box disagree about shape, and with the
  // 16:9 still this story used to show inside a 16:9 frame, `cover` and
  // `contain` were the same picture to the pixel - which reads as a broken
  // control rather than as a ratio that happened to match.
  args: { src: posterArt(0), fit: 'cover', position: '50% 50%', radius: 13, duration: 400 },
  controls: {
    fit: ['cover', 'contain'],
    radius: { min: 0, max: 40, step: 1 },
    duration: { min: 0, max: 1200, step: 100 },
  },
  // `fill` and a sized parent, which is how every call site uses it and the only
  // way it can be seen: every layer inside <Img> is absolutely positioned, so on
  // its own the surface has no height to be painted in. The height comes from
  // the RATIO rather than from a number, so the frame stays a 16:9 still at any
  // width the canvas gives it.
  render: ({ src, ...props }) => (
    <Box aspect={16 / 9}>
      <Img {...props} src={src || null} background={TINT} fill />
    </Box>
  ),
  scenes: [
    {
      name: 'Contain',
      docs: 'The same portrait art in the same landscape box, fitted whole instead of cropped: `contain` letterboxes it against the background gradient, where `cover` fills the frame and loses the top and bottom.',
      args: { fit: 'contain' },
    },
    {
      name: 'Focal point',
      docs: 'Cover, pulled to the top of the artwork with `position`. This is how a hero keeps a face out of the crop; it only bites while `cover` is discarding something.',
      args: { position: '50% 12%' },
    },
    {
      name: 'Ratio already matches',
      docs: 'A 16:9 still in the 16:9 frame. Here `cover` and `contain` are the SAME picture, and `position` does nothing - there is nothing to crop. Art the server sized for the box is the case worth aiming for.',
      args: { src: stillArt(0) },
    },
    {
      name: 'No artwork',
      docs: 'Nothing to load, so the gradient IS the image. This is also what you see offline, since the sample art is fetched from the web.',
      args: { src: '' },
    },
  ],
});
