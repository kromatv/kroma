import { useState } from 'react';

import { Box } from '#ui/components/atoms/box';

import { Button } from '#ui/components/atoms/button';

import { IconButton } from '#ui/components/atoms/icon-button';

import { Text } from '#ui/components/atoms/text';

import { Field } from '#ui/components/molecules/field';

import { SegmentGroup } from '#ui/components/molecules/segment-group';

import { Select } from '#ui/components/molecules/select';

import { CONTROL, type ControlSize } from '#ui/lib/field-shell';

export const LEVELS = [
  { value: 'all', label: 'All' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warnings' },
  { value: 'error', label: 'Errors' },
] as const;

export const SOURCES = [
  { value: 'all', label: 'Every source' },
  { value: 'server', label: 'kroma_server' },
  { value: 'torrents', label: 'tv.kroma.torrents' },
];

export /** The console's own filter row: the three controls that have to agree. */
function Row({ size }: Readonly<{ size: ControlSize }>) {
  const [level, setLevel] = useState<string>('all');
  const [source, setSource] = useState('all');
  return (
    <Box row align="center" gap={12} wrap>
      <SegmentGroup.Root size={size} label="Level" value={level} onValueChange={setLevel}>
        {LEVELS.map((option) => (
          <SegmentGroup.Item key={option.value} value={option.value}>
            <SegmentGroup.Label>{option.label}</SegmentGroup.Label>
          </SegmentGroup.Item>
        ))}
      </SegmentGroup.Root>
      <Select.Root label="Source" value={source} onValueChange={setSource}>
        <Select.Trigger size={size} />
        {SOURCES.map((option) => (
          <Select.Item key={option.value} value={option.value}>
            {option.label}
          </Select.Item>
        ))}
      </Select.Root>
      <Field.Root label="Filter the lines" hideLabel size={size} w={240}>
        {/* The console row is a browser page: a real input, not the TV caret form. */}
        <Field.Input icon="search" placeholder="Filter the lines…" physicalKeyboard />
      </Field.Root>
      <Button size={size} variant="glass" icon="refresh" label="Refresh" />
      <IconButton control={size} variant="glass" icon="dots-vertical" label="More" />
    </Box>
  );
}

export function Sized({ size }: Readonly<{ size: ControlSize }>) {
  const m = CONTROL[size];
  return (
    <Box gap={10}>
      <Text variant="overline" color="textDim">
        {`${size} · corner ${m.radius} · pad ${m.px}/${m.py} · line ${m.line}`}
      </Text>
      <Row size={size} />
    </Box>
  );
}
