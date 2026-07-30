import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { SkipIntroButton } from './SkipIntroButton';

export default story({
  name: 'SkipIntroButton',
  group: 'Actions',
  docs: "The one button that appears over the film without being asked for. It renders nothing at all when `visible` is false rather than hiding itself, so it costs nothing for the 95% of a film where there is no intro to skip. `focused` comes from the player's nav machine, not from the DOM: on a television this is a virtual focus target, because the real focus stays with the player surface.",
  usage: `<SkipIntroButton
  visible={inIntro}
  focused={nav.at === 'skip'}
  lift={transportHeight + gap}
  onSkip={jumpPastIntro}
/>`,
  guidelines: {
    do: [
      'Drive `visible` from the chapter data, and let it unmount itself when there is nothing to skip.',
      'Measure `lift` against the chrome it has to clear - the transport grows, shrinks and rides up over the up-next peek.',
    ],
    dont: [
      "Don't keep it on screen after the intro has passed - it becomes a mystery button.",
      "Don't pin `lift` to a constant: the number that clears the bare transport draws straight through the seek bar once the peek lifts it.",
    ],
  },
  matrix: false,
  width: { min: 480, max: 1000 },
  // Pinned bottom-right, so a stage narrower than `min` opens its scroller on the
  // empty left half with the pill off canvas.
  viewport: 'tv',
  args: { visible: true, focused: false, lift: 214 },
  controls: { lift: { min: 40, max: 400, step: 2 } },
  render: ({ visible, focused, lift }) => (
    // It positions itself absolutely against the player surface, so the story
    // provides a 16:9 one to sit in; `lift` is measured from the bottom of it.
    <Box aspect={16 / 9} minH={280} bg="surface2" radius="lg" overflow="hidden">
      <SkipIntroButton visible={visible} focused={focused} lift={lift} onSkip={() => {}} />
    </Box>
  ),
  scenes: [
    { name: 'Focused', docs: 'What the remote resting on it looks like.', args: { focused: true } },
    { name: 'Hidden', docs: 'Not styled away — it renders nothing.', args: { visible: false } },
  ],
});
