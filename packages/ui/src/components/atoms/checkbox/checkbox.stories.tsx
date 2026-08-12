import { story } from '@kroma/workbench/story';
import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { Checkbox, checkboxVariants } from './checkbox';

function Demo({ size }: Readonly<{ size?: 'sm' | 'tv' }>) {
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

export default story({
  name: 'Checkbox',
  group: 'Input',
  docs: 'The many-of-N control: a <Switch> says "this is on", a checkbox says "this one is included", which is why a list of them is a selection and a list of switches is a settings page. Announced as `checkbox` with its checked state, and as **mixed** when `indeterminate` - the parent of a partly selected group, which fills amber like a checked one because it has been acted on either way. A press from mixed checks everything under it.',
  usage: `<Checkbox label="Subtitles" checked={subs} onCheckedChange={setSubs} />
<Checkbox label="All" checked={all} indeterminate={some && !all} onCheckedChange={setAll} />`,
  guidelines: {
    do: [
      'Give it a `label`: it is the accessible name, even when a <Text> beside it carries the visible one.',
      'Use `indeterminate` for a parent row rather than leaving it unchecked, which claims nothing under it is picked.',
    ],
    dont: [
      "Don't use it for a setting that takes effect immediately - that is a <Switch>.",
      "Don't put one on every row by hand: a selectable list is a <ChoiceList>.",
    ],
  },
  variants: checkboxVariants,
  matrix: false,
  component: Demo,
});
