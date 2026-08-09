import { story } from '@kroma/workbench/story';
import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Dialog, DialogFooter, type DialogProps } from './dialog';

function Demo(props: Readonly<Omit<DialogProps, 'open' | 'onClose' | 'children'>>) {
  const [open, setOpen] = useState(false);
  return (
    <Box>
      <Button label="Open" onPress={() => setOpen(true)} />
      <Dialog {...props} open={open} onClose={() => setOpen(false)}>
        <DialogFooter>
          <Button variant="ghost" label="Cancel" onPress={() => setOpen(false)} />
          <Button variant="danger" label="Delete" autoFocus onPress={() => setOpen(false)} />
        </DialogFooter>
      </Dialog>
    </Box>
  );
}

export default story({
  name: 'Dialog',
  group: 'Overlays',
  docs: 'A modal box. It declares a focus SCOPE, which keeps the D-pad from wandering back into the page left behind: that is the difference between an overlay and a true modal on a television.',
  matrix: false,
  args: {
    title: 'Delete this profile?',
    description: 'This action cannot be undone.',
    width: 520,
  },
  controls: { width: { min: 320, max: 900, step: 20 } },
  render: (props) => <Demo {...props} />,
});
