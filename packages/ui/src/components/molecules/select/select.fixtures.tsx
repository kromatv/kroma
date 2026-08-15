import { useState } from 'react';

import { Box } from '#ui/components/atoms/box';

import type { IconName } from '#ui/components/atoms/icon';

import { Text } from '#ui/components/atoms/text';

import { Field } from '#ui/components/molecules/field';

import type { ControlSize } from '#ui/lib/field-shell';
import type { SelectPresentation } from './select';
import { Select } from './select';

export const TRACKS: readonly { value: string; label: string; note?: string; icon: IconName }[] = [
  { value: 'truehd', label: 'TrueHD 7.1', note: 'lossless', icon: 'volume' },
  { value: 'dd51', label: 'Dolby Digital 5.1', note: '640 kb/s', icon: 'volume' },
  { value: 'aac', label: 'AAC Stereo', note: '256 kb/s', icon: 'volume-2' },
  { value: 'commentary', label: "Director's commentary", icon: 'microphone' },
];

export interface TriggerArgs {
  size?: ControlSize;
  invalid?: boolean;
  block?: boolean;
  filled?: boolean;
}

export function Tracks({ size, invalid, block, filled }: Readonly<TriggerArgs>) {
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

export function Subtitles() {
  return (
    <Field.Root label="Subtitles">
      <Select.Root label="Subtitles" placeholder="Off">
        <Select.Trigger />
        <Select.Item value="en">English</Select.Item>
        <Select.Item value="en-sdh" note="generated">
          English SDH
        </Select.Item>
        <Select.Item value="fr">French</Select.Item>
      </Select.Root>
      <Field.Hint>Generated tracks are marked.</Field.Hint>
    </Field.Root>
  );
}

/** The options as they are actually read, in whichever presentation is named:
 *  a story showing only the trigger documents the half nobody has to be told
 *  about. `defaultOpen` mounts it open; the height holds the page still under
 *  the panel, which is portalled and therefore out of the document's flow. */
export function Options({ presentation }: Readonly<{ presentation: SelectPresentation }>) {
  const [track, setTrack] = useState('dd51');
  return (
    <Box h={presentation === 'panel' ? 260 : 0} w={280}>
      <Select.Root
        label="Audio track"
        value={track}
        onValueChange={setTrack}
        presentation={presentation}
        defaultOpen
      >
        <Select.Trigger block />
        {TRACKS.map((t) => (
          <Select.Item key={t.value} value={t.value} note={t.note} icon={t.icon}>
            {t.label}
          </Select.Item>
        ))}
      </Select.Root>
    </Box>
  );
}

export /** The reason the parts are named: a row the props API could not describe. */
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
