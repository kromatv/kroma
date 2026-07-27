import { story } from '@kroma/workbench/story';
import { Switch, switchVariants } from './switch';

export default story({
  name: 'Switch',
  group: 'Input',
  docs: 'The on/off switch. A television has no gestures: this is not a thumb you slide but a **Focusable** that toggles on Select, and the track fills with amber so the state reads from ten feet away. Pass `checked` to own the state, or just `defaultChecked` and it runs itself.',
  usage: `<Switch checked={subtitles} onChange={setSubtitles} />
<Switch defaultChecked />`,
  guidelines: {
    do: ['Use the `tv` size on a settings row read from the sofa.'],
    dont: ["Don't use a Switch for an action; it states a condition, not a command."],
  },
  variants: switchVariants,
  // `checked` is both a variant and a real prop: the control comes from the
  // `sv`, and declaring it here is what lets `render` read it with types.
  args: { disabled: false, checked: false as boolean },
  // `defaultChecked` + a remount key: the panel picks the starting state, and
  // the switch in the preview still toggles when pressed (uncontrolled).
  render: ({ checked, ...props }) => (
    <Switch {...props} key={String(checked)} defaultChecked={checked === true} />
  ),
});
