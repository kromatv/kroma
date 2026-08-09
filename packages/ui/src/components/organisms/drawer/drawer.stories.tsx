import { story } from '@kroma/workbench/story';
import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Txt } from '#ui/components/atoms/text';
import { Field } from '#ui/components/molecules/field';
import { Drawer } from './drawer';

function Demo({ side }: Readonly<{ side: 'left' | 'right' }>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="glass" label={`Open ${side} drawer`} onPress={() => setOpen(true)} />
      <Drawer open={open} onClose={() => setOpen(false)} title="Edit registry" side={side}>
        <Box p={28} gap={20}>
          <Txt variant="h2">Edit registry</Txt>
          <Field label="Name" defaultValue="Official" />
          <Field label="URL" defaultValue="https://modules.kroma.tv" />
          <Box row justify="flex-end" gap={10}>
            <Button variant="ghost" size="sm" label="Cancel" onPress={() => setOpen(false)} />
            <Button variant="primary" size="sm" label="Save" onPress={() => setOpen(false)} />
          </Box>
        </Box>
      </Drawer>
    </>
  );
}

export default story({
  name: 'Drawer',
  group: 'Overlays',
  docs: 'The edge-anchored slide-in panel: a detail inspector, an edit form, the phone nav sheet. The same overlay contract as **Dialog** - portalled, scroll-locked, focus locked behind it, Esc/Back and outside-press dismiss, `role="dialog"` with `title` as its accessible name - but anchored to a side with its own enter/exit slide. It stays mounted through the exit, so callers just flip `open`. `fullBelow` makes it take the whole screen under a viewport width (the phone nav), and `panelStyle` recolours the surface.',
  usage: `<Drawer open={open} onClose={close} title="Edit registry" width={460}>
  ...the panel owns its header and content...
</Drawer>`,
  guidelines: {
    do: [
      'Give `title` a real name even though nothing visible renders it - it is what a screen reader announces.',
      'Use it for edit-in-context panels; a decision between two actions is a <Dialog>.',
    ],
    dont: ["Don't stack drawers; a drawer opening a drawer is a navigation problem."],
  },
  matrix: false,
  args: { side: 'right' as 'left' | 'right' },
  controls: { side: ['right', 'left'] },
  render: ({ side }) => <Demo side={side} />,
});
