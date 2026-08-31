import { type ReactNode, useState } from 'react';

import { Avatar } from '#ui/components/atoms/avatar';

import { Box, Row } from '#ui/components/atoms/box';

import { Button } from '#ui/components/atoms/button';

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

const STATUSES = [
  { value: 'active', label: 'Downloading', icon: 'download' },
  { value: 'done', label: 'Done', icon: 'circle-check' },
  { value: 'failed', label: 'Failed', icon: 'alert-triangle' },
] as const satisfies readonly { value: string; label: string; icon: IconName }[];

function StatusPicker({
  start = [],
  size,
  presentation,
  defaultOpen = false,
}: Readonly<{
  start?: readonly string[];
  size?: ControlSize;
  presentation?: SelectPresentation;
  defaultOpen?: boolean;
}>) {
  const [picked, setPicked] = useState<readonly string[]>(start);
  return (
    <Select.Root
      multiple
      label="Status"
      placeholder="Any status"
      value={picked}
      onValueChange={setPicked}
      presentation={presentation}
      defaultOpen={defaultOpen}
    >
      <Select.Trigger size={size} block />
      {STATUSES.map((status) => (
        <Select.Item key={status.value} value={status.value} icon={status.icon}>
          {status.label}
        </Select.Item>
      ))}
    </Select.Root>
  );
}

function Labelled({ name, children }: Readonly<{ name: string; children: ReactNode }>) {
  return (
    <Box gap={6}>
      <Text variant="overline" color="textDim">
        {name}
      </Text>
      {children}
    </Box>
  );
}

export function Statuses({ presentation }: Readonly<{ presentation: SelectPresentation }>) {
  return (
    <Box h={presentation === 'panel' ? 260 : 0} w={280}>
      <StatusPicker start={['active', 'failed']} presentation={presentation} defaultOpen />
    </Box>
  );
}

export function Summaries({ size }: Readonly<{ size?: ControlSize }>) {
  return (
    <Box gap={20} w={280}>
      <Labelled name="nothing picked">
        <StatusPicker size={size} />
      </Labelled>
      <Labelled name="one picked">
        <StatusPicker size={size} start={['done']} />
      </Labelled>
      <Labelled name="several picked">
        <StatusPicker size={size} start={['active', 'done', 'failed']} />
      </Labelled>
    </Box>
  );
}

const MEMBERS = ['Ada Lovelace', 'Grace Hopper', 'Katherine Johnson'] as const;

export function Members({ presentation }: Readonly<{ presentation: SelectPresentation }>) {
  const [who, setWho] = useState('Ada Lovelace');
  return (
    <Box h={presentation === 'panel' ? 240 : 0} w={240}>
      <Select.Root
        label="Member"
        value={who}
        onValueChange={setWho}
        presentation={presentation}
        defaultOpen
      >
        <Select.Trigger block />
        <Select.Item value="everyone" label="Every member" icon="users" />
        {MEMBERS.map((name) => (
          <Select.Item key={name} value={name} label={name}>
            <Select.Media>
              <Avatar name={name} size={18} circle shadow={false} />
            </Select.Media>
          </Select.Item>
        ))}
      </Select.Root>
    </Box>
  );
}

export function LongOptions() {
  const [range, setRange] = useState('live');
  return (
    <Row justify="flex-end" w={420}>
      <Box h={220}>
        <Select.Root
          label="Window"
          value={range}
          onValueChange={setRange}
          presentation="panel"
          defaultOpen
        >
          <Select.Trigger />
          <Select.Item value="live" label="Real time" />
          <Select.Item value="12h" label="The last twelve hours" />
          <Select.Item value="24h" label="The last twenty-four hours" />
          <Select.Item value="all" label="Everything on record" />
        </Select.Root>
      </Box>
    </Row>
  );
}

export function Clearable() {
  const [picked, setPicked] = useState<readonly string[]>(['done', 'failed']);
  return (
    <Row gap={10} w={380}>
      <Box flex>
        <Select.Root
          multiple
          label="Status"
          placeholder="Any status"
          value={picked}
          onValueChange={setPicked}
        >
          <Select.Trigger block />
          {STATUSES.map((status) => (
            <Select.Item key={status.value} value={status.value} icon={status.icon}>
              {status.label}
            </Select.Item>
          ))}
        </Select.Root>
      </Box>
      <Button
        variant="ghost"
        icon="x"
        label="Clear"
        disabled={picked.length === 0}
        onPress={() => setPicked([])}
      />
    </Row>
  );
}
