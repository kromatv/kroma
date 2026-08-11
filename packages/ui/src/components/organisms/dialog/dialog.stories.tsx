import { story } from '@kroma/workbench/story';
import { type ReactNode, useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Text } from '#ui/components/atoms/text';
import { Dialog, type DialogProps } from './dialog';

type DemoProps = Omit<DialogProps, 'open' | 'onClose' | 'children'>;

function Demo({
  panel,
  ...props
}: Readonly<DemoProps & { panel: (close: () => void) => ReactNode }>) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Box>
      <Button label="Open" onPress={() => setOpen(true)} />
      <Dialog {...props} open={open} onClose={close}>
        {panel(close)}
      </Dialog>
    </Box>
  );
}

export default story({
  name: 'Dialog',
  group: 'Overlays',
  docs: 'A modal box. It declares a focus SCOPE, which keeps the D-pad from wandering back into the page left behind: that is the difference between an overlay and a true modal on a television.\n\nThe panel is made of three bands, and only the middle one scrolls: **Dialog.Header** and **Dialog.Footer** stay put while **Dialog.Content** moves under them, so a long form never scrolls its own title away or its actions out of reach. **Dialog.Actions** is the row of controls itself - one focus group, right-aligned - so a footer is a shelf holding an actions row rather than a second row competing with it.\n\nPass `title` / `description` / `footer` for the ordinary case and the panel arranges the bands for you; reach for the parts when a panel needs a header of its own.',
  usage: `<Dialog
  open={open}
  onClose={close}
  title="Delete this profile?"
  footer={
    <Dialog.Actions
      cancelLabel="Cancel"
      onCancel={close}
      confirmLabel="Delete"
      onConfirm={remove}
      destructive
    />
  }
/>

<Dialog open={open} onClose={close}>
  <Dialog.Header>…</Dialog.Header>
  <Dialog.Content>…</Dialog.Content>
  <Dialog.Footer>
    <Dialog.Actions cancelLabel="Cancel" onCancel={close} confirmLabel="Save" onConfirm={save}>
      <Button variant="dangerGhost" size="sm" label="Delete account" onPress={remove} />
    </Dialog.Actions>
  </Dialog.Footer>
</Dialog>`,
  guidelines: {
    do: [
      "Put a panel's controls in a <Dialog.Actions>: it is the one focus group a remote walks.",
      'Use `destructive` for a confirm that destroys something; the pair stays cancel-then-confirm.',
      'Hand extra actions to <Dialog.Actions> as children; they sit opposite the pair.',
    ],
    dont: [
      "Don't nest one actions row inside another: one panel, one focus group.",
      "Don't put a bare row of buttons in <Dialog.Footer>; the footer is the shelf, not the row.",
    ],
  },
  matrix: false,
  args: {
    title: 'Delete this profile?',
    description: 'This action cannot be undone.',
    width: 520,
  },
  controls: { width: { min: 320, max: 900, step: 20 } },
  render: (props) => (
    <Demo
      {...props}
      panel={(close) => (
        <Dialog.Actions
          cancelLabel="Cancel"
          onCancel={close}
          confirmLabel="Delete"
          onConfirm={close}
          destructive
        />
      )}
    />
  ),
  scenes: [
    {
      name: 'Cancel and save',
      docs: 'The everyday pair: a quiet way out, and an accent confirm that spins while it saves.',
      render: (props) => (
        <Demo
          {...props}
          title="Edit library"
          panel={(close) => (
            <Dialog.Actions
              cancelLabel="Cancel"
              onCancel={close}
              confirmLabel="Save"
              onConfirm={close}
            />
          )}
        />
      ),
    },
    {
      name: 'A third action',
      docs: 'Children are extra controls, pushed to the edge opposite the pair. This is where a "Delete account" belongs, as a real button rather than a config object.',
      render: (props) => (
        <Demo
          {...props}
          title="Edit account"
          panel={(close) => (
            <Dialog.Actions
              cancelLabel="Cancel"
              onCancel={close}
              confirmLabel="Save"
              onConfirm={close}
            >
              <Button variant="dangerGhost" size="sm" label="Delete account" onPress={close} />
            </Dialog.Actions>
          )}
        />
      ),
    },
    {
      name: 'Composed',
      docs: "The bands written out: a header of the panel's own, a scrolling middle, and a footer shelf holding the actions row.",
      render: (props) => (
        <Demo
          {...props}
          titleHidden
          panel={(close) => (
            <>
              <Dialog.Header>
                <Text variant="h2">Active sessions</Text>
                <Text color="textMuted">Three devices are playing this account.</Text>
              </Dialog.Header>
              <Dialog.Content>
                <Text>Salon</Text>
                <Text>iPhone de Maxime</Text>
                <Text>MacBook Pro</Text>
              </Dialog.Content>
              <Dialog.Footer>
                <Dialog.Actions>
                  <Button variant="ghost" size="sm" label="Close" onPress={close} />
                </Dialog.Actions>
              </Dialog.Footer>
            </>
          )}
        />
      ),
    },
  ],
});
