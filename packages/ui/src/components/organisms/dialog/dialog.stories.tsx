import { story } from '@kroma/workbench/story';
import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Dialog, type DialogProps } from './dialog';

function Demo(props: Readonly<Omit<DialogProps, 'open' | 'onClose' | 'children'>>) {
  const [open, setOpen] = useState(false);
  return (
    <Box>
      <Button label="Open" onPress={() => setOpen(true)} />
      <Dialog {...props} open={open} onClose={() => setOpen(false)}>
        <Dialog.Footer>
          <Button variant="ghost" label="Cancel" onPress={() => setOpen(false)} />
          <Button variant="danger" label="Delete" autoFocus onPress={() => setOpen(false)} />
        </Dialog.Footer>
      </Dialog>
    </Box>
  );
}

export default story({
  name: 'Dialog',
  group: 'Overlays',
  docs: 'A modal box. It declares a focus SCOPE, which keeps the D-pad from wandering back into the page left behind: that is the difference between an overlay and a true modal on a television.\n\nThe panel is made of three parts, and only the middle one scrolls: **Dialog.Header** and **Dialog.Footer** stay put while **Dialog.Content** moves under them, so a long form never scrolls its own title away or its actions out of reach. Pass `title` / `description` / `footer` for the ordinary case and the panel arranges the parts for you; reach for the parts directly when a panel needs a header of its own.',
  usage: `<Dialog open={open} onClose={close} title="Delete this profile?">
  <Dialog.Footer>
    <Button variant="ghost" label="Cancel" onPress={close} />
    <Button variant="danger" label="Delete" onPress={remove} />
  </Dialog.Footer>
</Dialog>`,
  matrix: false,
  args: {
    title: 'Delete this profile?',
    description: 'This action cannot be undone.',
    width: 520,
  },
  controls: { width: { min: 320, max: 900, step: 20 } },
  render: (props) => <Demo {...props} />,
});
