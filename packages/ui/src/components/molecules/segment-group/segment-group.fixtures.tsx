import { useState } from 'react';

import { Box } from '#ui/components/atoms/box';

import type { ControlSize } from '#ui/lib/field-shell';

import { SegmentGroup } from './segment-group';

export function Modes({ size }: Readonly<{ size?: ControlSize }>) {
  const [mode, setMode] = useState('auto');
  return (
    <SegmentGroup.Root label="Playback mode" size={size} value={mode} onValueChange={setMode}>
      <SegmentGroup.Item value="auto">
        <SegmentGroup.Label>Auto</SegmentGroup.Label>
        <SegmentGroup.Hint>Recommended</SegmentGroup.Hint>
      </SegmentGroup.Item>
      <SegmentGroup.Item value="direct">
        <SegmentGroup.Label>Direct play</SegmentGroup.Label>
      </SegmentGroup.Item>
      <SegmentGroup.Item value="transcode">
        <SegmentGroup.Label>Transcode</SegmentGroup.Label>
        <SegmentGroup.Hint>CPU heavy</SegmentGroup.Hint>
      </SegmentGroup.Item>
    </SegmentGroup.Root>
  );
}

export function Glyphs() {
  const [view, setView] = useState('grid');
  return (
    <SegmentGroup.Root label="View" value={view} onValueChange={setView}>
      <SegmentGroup.Item value="grid" icon="layout-grid" label="Grid" />
      <SegmentGroup.Item value="list" icon="list" label="List" />
      <SegmentGroup.Item value="table" icon="table" label="Table" />
    </SegmentGroup.Root>
  );
}

export function Stretched() {
  const [filter, setFilter] = useState('all');
  return (
    <Box w={420}>
      <SegmentGroup.Root label="Filter" stretch value={filter} onValueChange={setFilter}>
        <SegmentGroup.Item value="all">
          <SegmentGroup.Label>All</SegmentGroup.Label>
        </SegmentGroup.Item>
        <SegmentGroup.Item value="unread">
          <SegmentGroup.Label>Unread</SegmentGroup.Label>
        </SegmentGroup.Item>
        <SegmentGroup.Item value="mentions">
          <SegmentGroup.Label>Mentions</SegmentGroup.Label>
        </SegmentGroup.Item>
      </SegmentGroup.Root>
    </Box>
  );
}

export function WithDisabled() {
  const [quality, setQuality] = useState('1080p');
  return (
    <SegmentGroup.Root label="Quality" value={quality} onValueChange={setQuality}>
      <SegmentGroup.Item value="original">
        <SegmentGroup.Label>Original</SegmentGroup.Label>
      </SegmentGroup.Item>
      <SegmentGroup.Item value="1080p">
        <SegmentGroup.Label>1080p</SegmentGroup.Label>
      </SegmentGroup.Item>
      <SegmentGroup.Item value="720p" disabled>
        <SegmentGroup.Label>720p</SegmentGroup.Label>
        <SegmentGroup.Hint>No transcoder</SegmentGroup.Hint>
      </SegmentGroup.Item>
    </SegmentGroup.Root>
  );
}

export function Sizes() {
  return (
    <Box gap={16} align="flex-start">
      <Modes size="sm" />
      <Modes size="md" />
      <Modes size="tv" />
    </Box>
  );
}
