import { story } from '@kroma/workbench/story';
import type { IconName } from '#ui/lib/glyph';
import { Button, buttonVariants } from './button';

export default story({
  name: 'Button',
  group: 'Actions',
  docs: "The primary action. It is a **Focusable**, so the same component is a mouse-driven button in a browser and a D-pad target on a television, with the design's amber ring and press scale already wired in.\n\nEach variant carries three coats of feedback, one per input: the ring for the remote, a brightened fill under a finger, and — on the web only — a **hover** step one shade short of the pressed one, which is the only answer a cursor gets on a page that mounts no focus scope.",
  usage: `<Button icon="player-play-filled" label="Play" onPress={play} />
<Button variant="outline" active={inList} label="My list" />`,
  guidelines: {
    do: [
      'One `primary` button per screen: it answers "what happens on Enter".',
      'Use `outline` with `active` for toggles that read as pressed, not as actions.',
      'Use the `tv` size for the 10-foot primary action (hero, detail screen).',
    ],
    dont: [
      "Don't use `danger` for anything reversible - it promises destruction.",
      "Don't stack two `primary` buttons; demote one to `glass` or `ghost`.",
    ],
  },
  variants: buttonVariants,
  args: {
    label: 'Play',
    // The empty string is the icon control's "none" option, so the type has to
    // admit it even though <Button> does not.
    icon: 'player-play-filled' as IconName | '',
    iconRight: '' as IconName | '',
    disabled: false,
    loading: false,
  },
  controls: { icon: 'icon', iconRight: 'icon' },
  render: ({ icon, iconRight, ...props }) => (
    <Button {...props} icon={icon || undefined} iconRight={iconRight || undefined} />
  ),
});
