import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Field } from '#ui/components/molecules/field';
import { Select } from './select';

const TRACKS = [
  { value: 'truehd', label: 'TrueHD 7.1', note: 'lossless', icon: 'volume' },
  { value: 'dd51', label: 'Dolby Digital 5.1', note: '640 kb/s', icon: 'volume' },
  { value: 'aac', label: 'AAC Stereo', note: '256 kb/s', icon: 'volume-2' },
  { value: 'commentary', label: "Director's commentary", icon: 'microphone' },
] as const;

export default story({
  name: 'Select',
  group: 'Input',
  docs: "Pick one of a few, from a trigger that says what is picked. Where the options appear is the platform's decision: under a D-pad they open in a **Dialog** (a modal is its own view controller on tvOS, so the remote is confined to the options for free), and under a pointer they open as an anchored listbox popover with the full combobox keyboard - arrows, Home/End, type-ahead, Enter picks, Esc returns to the trigger - announced through `aria-activedescendant`. The trigger wears <TextField>'s well, so a form reads as one family of controls. Wrap it in a `<Field>` for a label, hint and error, exactly as you would the entry.",
  usage: `<Select
  label="Audio track"
  options={[
    { value: 'truehd', label: 'TrueHD 7.1', note: 'lossless' },
    { value: 'aac', label: 'AAC Stereo', note: '256 kb/s' },
  ]}
  value={track}
  onChange={setTrack}
/>`,
  guidelines: {
    do: [
      'Use a `note` for the fact that settles the choice: a bitrate, a codec, a count.',
      'Wrap it in `<Field>` for the label row - the select is the control, not the form row.',
    ],
    dont: [
      "Don't reach for it with two options - two Chips show both answers at once.",
      "Don't put dozens of items in one: past a screenful it is a search problem, not a pick.",
    ],
  },
  matrix: false,
  width: 420,
  args: { disabled: false, invalid: false },
  render: ({ disabled, invalid }) => (
    <Box gap={24}>
      <Select
        label="Audio track"
        options={TRACKS}
        defaultValue="dd51"
        disabled={disabled}
        invalid={invalid}
      />
      <Field label="Subtitles" hint="Generated tracks are marked.">
        <Select
          label="Subtitles"
          placeholder="Off"
          options={[
            { value: 'en', label: 'English' },
            { value: 'en-sdh', label: 'English SDH', note: 'generated' },
            { value: 'fr', label: 'Français' },
          ]}
        />
      </Field>
    </Box>
  ),
});
