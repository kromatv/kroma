import { useState } from 'react';

import { Box } from '#ui/components/atoms/box';

import { Text } from '#ui/components/atoms/text';

import { Checkbox } from './checkbox';

export function Demo({ size }: Readonly<{ size?: 'sm' | 'tv' }>) {
  const [subs, setSubs] = useState(true);
  const [audio, setAudio] = useState(false);
  const all = subs && audio;
  const some = subs || audio;
  return (
    <Box gap={14}>
      <Box row align="center" gap={10}>
        <Checkbox
          size={size}
          label="Select all"
          checked={all}
          indeterminate={some && !all}
          onCheckedChange={(next) => {
            setSubs(next);
            setAudio(next);
          }}
        />
        <Text variant="body">Select all</Text>
      </Box>
      <Box row align="center" gap={10} ml={22}>
        <Checkbox size={size} label="Subtitles" checked={subs} onCheckedChange={setSubs} />
        <Text variant="body" color="textMuted">
          Subtitles
        </Text>
      </Box>
      <Box row align="center" gap={10} ml={22}>
        <Checkbox size={size} label="Audio tracks" checked={audio} onCheckedChange={setAudio} />
        <Text variant="body" color="textMuted">
          Audio tracks
        </Text>
      </Box>
    </Box>
  );
}
