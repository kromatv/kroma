import { story } from '@kroma/workbench/story';
import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import type { IconName } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { Field } from '#ui/components/molecules/field';
import type { ControlSize } from '#ui/lib/field-shell';
import { Select, selectTriggerVariants } from './select';

const TRACKS: readonly { value: string; label: string; note?: string; icon: IconName }[] = [
  { value: 'truehd', label: 'TrueHD 7.1', note: 'lossless', icon: 'volume' },
  { value: 'dd51', label: 'Dolby Digital 5.1', note: '640 kb/s', icon: 'volume' },
  { value: 'aac', label: 'AAC Stereo', note: '256 kb/s', icon: 'volume-2' },
  { value: 'commentary', label: "Director's commentary", icon: 'microphone' },
];

interface TriggerArgs {
  size: ControlSize;
  invalid: boolean;
  block: boolean;
  filled: boolean;
}

function Tracks({ size, invalid, block, filled }: Readonly<TriggerArgs>) {
  const [track, setTrack] = useState('dd51');
  return (
    <Select.Root
      label="Audio track"
      placeholder="Original"
      value={filled ? track : ''}
      onValueChange={setTrack}
    >
      <Select.Trigger size={size} invalid={invalid} block={block} />
      {TRACKS.map((t) => (
        <Select.Item key={t.value} value={t.value} note={t.note} icon={t.icon}>
          {t.label}
        </Select.Item>
      ))}
    </Select.Root>
  );
}

function Subtitles() {
  return (
    <Field.Root label="Subtitles" hint="Generated tracks are marked.">
      <Select.Root label="Subtitles" placeholder="Off">
        <Select.Trigger />
        <Select.Item value="en">English</Select.Item>
        <Select.Item value="en-sdh" note="generated">
          English SDH
        </Select.Item>
        <Select.Item value="fr">Français</Select.Item>
      </Select.Root>
    </Field.Root>
  );
}

/** The reason the parts are named: a row the props API could not describe. */
function Composed() {
  const [quality, setQuality] = useState('1080p');
  return (
    <Select.Root label="Quality" value={quality} onValueChange={setQuality}>
      <Select.Trigger block />
      <Select.Item value="original" label="Original">
        <Box gap={2} flex>
          <Text variant="body">Original</Text>
          <Text variant="meta" color="textDim">
            The file as it is, no transcoding
          </Text>
        </Box>
        <Select.Indicator />
      </Select.Item>
      <Select.Item value="1080p" label="1080p" note="8 Mb/s" />
      <Select.Item value="720p" label="720p" note="4 Mb/s" disabled />
    </Select.Root>
  );
}

export default story({
  name: 'Select',
  group: 'Input',
  docs: "Pick one of a few, from a trigger that says what is picked. Composed rather than configured, in Radix's shape: **Root** owns the value and the open state, **Trigger** wears <TextField>'s well, **Value** says what is picked and **Item / Indicator** are the row. Where the options appear is the platform's decision: under a D-pad they open in a **Dialog** (a modal is its own view controller on tvOS, so the remote is confined to the options for free), and under a pointer they open as an anchored listbox popover with the full combobox keyboard - arrows, Home/End, type-ahead, Enter picks, Esc returns to the trigger - announced through `aria-activedescendant`. Every way out is reported: `onOpenChange(open, { reason })` says `select`, `outside`, `escape` or `back` - the remote's Back button.",
  usage: `<Select.Root label="Audio track" value={track} onValueChange={setTrack}>
  <Select.Trigger />
  <Select.Item value="truehd" note="lossless">TrueHD 7.1</Select.Item>
  <Select.Item value="aac" note="256 kb/s">AAC Stereo</Select.Item>
</Select.Root>

// Write the row yourself when the sugar is not enough:
<Select.Item value="original" label="Original">
  <Box gap={2} flex>
    <Text variant="body">Original</Text>
    <Text variant="meta" color="textDim">No transcoding</Text>
  </Box>
  <Select.Indicator />
</Select.Item>`,
  guidelines: {
    do: [
      'Use a `note` for the fact that settles the choice: a bitrate, a codec, a count.',
      'Wrap it in `<Field>` for the label row - the select is the control, not the form row.',
      'Give a composed row a `label`: it is what the trigger and assistive tech read.',
    ],
    dont: [
      "Don't reach for it with two options - two Chips show both answers at once.",
      "Don't put dozens of items in one: past a screenful it is a search problem, not a pick.",
    ],
  },
  variants: selectTriggerVariants,
  matrix: false,
  width: 420,
  args: { size: 'md' as ControlSize, invalid: false, block: false, filled: true },
  render: (args: TriggerArgs) => (
    <Box gap={24}>
      <Tracks {...args} />
      <Subtitles />
    </Box>
  ),
  scenes: [
    {
      name: 'Composed',
      docs: 'A row written out of the parts, beside the one-line sugar and a disabled option.',
      render: () => <Composed />,
    },
  ],
});
