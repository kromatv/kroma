import { useState } from 'react';

import { Badge } from '#ui/components/atoms/badge';

import { Box } from '#ui/components/atoms/box';

import { IconButton } from '#ui/components/atoms/icon-button';

import { ChoiceList } from './choice-list';

export const QUALITIES = [
  { value: 'original', label: 'Original', hint: 'The file as it is, no transcoding' },
  { value: '1080p', label: '1080p', hint: 'Up to 8 Mb/s' },
  { value: '720p', label: '720p', hint: 'Up to 4 Mb/s' },
];

export const LIBRARIES = [
  { value: 'films', label: 'Films' },
  { value: 'series', label: 'Series' },
  { value: 'concerts', label: 'Concerts', hint: 'Scan in progress' },
];

export function Single() {
  const [quality, setQuality] = useState<string | null>('original');
  return (
    <ChoiceList.Root label="Quality" value={quality} onValueChange={setQuality}>
      {QUALITIES.map((q) => (
        <ChoiceList.Item key={q.value} value={q.value}>
          <ChoiceList.Label>{q.label}</ChoiceList.Label>
          <ChoiceList.Hint>{q.hint}</ChoiceList.Hint>
        </ChoiceList.Item>
      ))}
    </ChoiceList.Root>
  );
}

export function Multiple() {
  const [picked, setPicked] = useState<string[]>(['films']);
  return (
    <ChoiceList.Root mode="multiple" label="Libraries" value={picked} onValueChange={setPicked}>
      {LIBRARIES.map((lib) => (
        <ChoiceList.Item key={lib.value} value={lib.value}>
          <ChoiceList.Label>{lib.label}</ChoiceList.Label>
          {lib.hint ? <ChoiceList.Hint>{lib.hint}</ChoiceList.Hint> : null}
        </ChoiceList.Item>
      ))}
    </ChoiceList.Root>
  );
}

export function WithActions() {
  const [picked, setPicked] = useState<string[]>(['films']);
  return (
    <ChoiceList.Root mode="multiple" label="Libraries" value={picked} onValueChange={setPicked}>
      {LIBRARIES.map((lib) => (
        <ChoiceList.Item
          key={lib.value}
          value={lib.value}
          actions={
            <IconButton
              variant="ghost"
              diameter={32}
              glyph={16}
              icon="trash"
              label={`Remove ${lib.label}`}
            />
          }
        >
          <ChoiceList.Label>{lib.label}</ChoiceList.Label>
        </ChoiceList.Item>
      ))}
    </ChoiceList.Root>
  );
}

export /** A row the plain label-and-hint column could not describe. */
function Composed() {
  const [picked, setPicked] = useState<string[]>(['films']);
  return (
    <ChoiceList.Root mode="multiple" label="Libraries" value={picked} onValueChange={setPicked}>
      {LIBRARIES.map((lib) => (
        <ChoiceList.Item key={lib.value} value={lib.value}>
          <Box row align="center" gap={8}>
            <ChoiceList.Label>{lib.label}</ChoiceList.Label>
            {lib.hint ? <Badge tone="warning">scanning</Badge> : null}
          </Box>
          <ChoiceList.Hint>{lib.hint ?? '128 titles · 1.2 TB'}</ChoiceList.Hint>
        </ChoiceList.Item>
      ))}
    </ChoiceList.Root>
  );
}
