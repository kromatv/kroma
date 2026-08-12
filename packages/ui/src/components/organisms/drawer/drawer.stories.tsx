import { story } from '@kroma/workbench/story';
import { type ReactNode, useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Text } from '#ui/components/atoms/text';
import { Field } from '#ui/components/molecules/field';
import { Drawer, type DrawerRootProps } from './drawer';

type DemoProps = Omit<DrawerRootProps, 'open' | 'onClose' | 'children'>;

const LONG_LIST = Array.from({ length: 24 }, (_, i) => `tv.kroma.module${i}`);

function Demo({
  body,
  ...props
}: Readonly<DemoProps & { body: (close: () => void) => ReactNode }>) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Box>
      <Button
        variant="glass"
        label={`Open ${props.side ?? 'right'} drawer`}
        onPress={() => setOpen(true)}
      />
      <Drawer.Root {...props} open={open} onClose={close}>
        {body(close)}
      </Drawer.Root>
    </Box>
  );
}

export default story({
  name: 'Drawer',
  group: 'Overlays',
  usage: `<Drawer.Root open={open} onClose={close} title="Edit registry">
  <Field.Root label="Name" />
</Drawer.Root>

<Drawer.Root open={open} onClose={close} title="Edit registry">
  <Drawer.Header>…</Drawer.Header>
  <Drawer.Panel>…</Drawer.Panel>
  <Drawer.Footer>…</Drawer.Footer>
</Drawer.Root>`,
  guidelines: {
    do: [
      'Give `title` a real name: it is what a screen reader announces, and what the default header draws.',
      'Put the long body in <Drawer.Panel>; it is the one band that scrolls, and it scrolls on a television too.',
      'Use it for edit-in-context panels; a decision between two actions is a <Dialog>.',
      'Put a <Drawer.Close /> in a header of your own: it carries the Root’s onClose, so the sheet keeps one way out rather than two.',
    ],
    dont: [
      "Don't scroll the sheet with a pane of your own; a <div> with overflow-y does nothing on native.",
      "Don't stack drawers; a drawer opening a drawer is a navigation problem.",
    ],
  },
  matrix: false,
  args: { title: 'Edit registry', side: 'right' as 'left' | 'right', width: 460 },
  controls: { side: ['right', 'left'], width: { min: 320, max: 720, step: 20 } },
  render: (props) => (
    <Demo
      {...props}
      body={(close) => (
        <>
          <Field.Root label="Name" defaultValue="Official" />
          <Field.Root label="URL" defaultValue="https://modules.kroma.tv" />
          <Button variant="primary" size="sm" label="Save" onPress={close} />
        </>
      )}
    />
  ),
  scenes: [
    {
      name: 'Composed',
      docs: "The bands written out: a header of the sheet's own, a scrolling middle long enough to prove it scrolls, and a footer shelf pinned under it.",
      render: (props) => (
        <Demo
          {...props}
          body={(close) => (
            <>
              <Drawer.Header>
                <Box row between>
                  <Text variant="overline" color="textDim">
                    Registry
                  </Text>
                  <Drawer.Close />
                </Box>
                <Text variant="h2" mt={4}>
                  Official
                </Text>
              </Drawer.Header>
              <Drawer.Panel>
                {LONG_LIST.map((id) => (
                  <Text key={id} color="textMuted">
                    {id}
                  </Text>
                ))}
              </Drawer.Panel>
              <Drawer.Footer>
                <Button block label="Close" onPress={close} />
              </Drawer.Footer>
            </>
          )}
        />
      ),
    },
    {
      name: 'A pinned action',
      docs: 'The footer is the shelf the panel never scrolls away, whatever the body does.',
      render: (props) => (
        <Demo
          {...props}
          body={() => (
            <>
              <Field.Root label="Name" defaultValue="Official" />
              <Field.Root label="URL" defaultValue="https://modules.kroma.tv" />
              <Drawer.Footer>
                <Button block label="Request" />
              </Drawer.Footer>
            </>
          )}
        />
      ),
    },
  ],
});
