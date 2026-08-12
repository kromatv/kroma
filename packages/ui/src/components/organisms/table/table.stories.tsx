import { story } from '@kroma/workbench/story';
import { Badge } from '#ui/components/atoms/badge';
import { Chip } from '#ui/components/atoms/chip';
import { Text } from '#ui/components/atoms/text';
import { Table, type TableVariant } from './table';

const MODULES = [
  { id: 'tv.kroma.torrents', port: '41310', state: 'Running' },
  { id: 'tv.kroma.whisper', port: '41311', state: 'Running' },
  { id: 'tv.kroma.vpn', port: '41312', state: 'Stopped' },
];

export default story({
  name: 'Table',
  group: 'Layout',
  docs: "Rows of the same shape, read down a column as much as across a row. There is no `<table>` on a television, so the grid is Yoga's: a row is a flex row and a cell is a flex child of it, which means a column is only a column while every row holds the same number of cells. The rows are children rather than a `data` prop because a table is written, not fetched; a collection long enough to need windowing is <VirtualGrid>, not this.",
  usage: `<Table.Root label="Modules">
  <Table.Header>
    <Table.Row>
      <Table.Cell>Module</Table.Cell>
      <Table.Cell>Port</Table.Cell>
    </Table.Row>
  </Table.Header>
  <Table.Body>
    <Table.Row>
      <Table.Cell>tv.kroma.torrents</Table.Cell>
      <Table.Cell>41310</Table.Cell>
    </Table.Row>
  </Table.Body>
</Table.Root>`,
  guidelines: {
    do: [
      'Write the same number of cells in every row: a column is as wide as the cells in it, and nothing else lines them up.',
      'Name the table on the Root with `label`, so a reader who lands in the middle of it hears what it is.',
      'Use `variant="plain"` where the table sits in a column of text: it has no frame to be inset from, so it lines up with the paragraph above it.',
    ],
    dont: [
      "Don't reach for it for a long collection - a table materialises every row, so windowing is <VirtualGrid>.",
      "Don't rule a row by hand: the seam belongs to the row under it, which is what keeps the last one from doubling the frame.",
      "Don't put a control in a cell where the whole row is the thing being chosen - that is <ListRow>.",
    ],
  },
  matrix: false,
  width: { min: 380, max: 720 },
  args: { variant: 'framed' as TableVariant },
  controls: { variant: ['framed', 'plain'] },
  render: ({ variant }) => (
    <Table.Root variant={variant} label="Modules">
      <Table.Header>
        <Table.Row>
          <Table.Cell>Module</Table.Cell>
          <Table.Cell>Port</Table.Cell>
          <Table.Cell>State</Table.Cell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {MODULES.map((module) => (
          <Table.Row key={module.id}>
            <Table.Cell>{module.id}</Table.Cell>
            <Table.Cell>{module.port}</Table.Cell>
            <Table.Cell>{module.state}</Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  ),
  scenes: [
    {
      name: 'Composed cells',
      docs: "A cell holds whatever it is about. Only a plain string is set in the table's own type; anything else is drawn as it was written, which is how a badge or a chip lands in a column.",
      render: ({ variant }) => (
        <Table.Root variant={variant} label="Files">
          <Table.Header>
            <Table.Row>
              <Table.Cell>File</Table.Cell>
              <Table.Cell>Video</Table.Cell>
              <Table.Cell>Direct play</Table.Cell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            <Table.Row>
              <Table.Cell>Blade Runner 2049.mkv</Table.Cell>
              <Table.Cell>
                <Badge tone="HDR">HDR</Badge>
              </Table.Cell>
              <Table.Cell>
                <Chip label="Yes" size="sm" dot="success" />
              </Table.Cell>
            </Table.Row>
            <Table.Row>
              <Table.Cell>Arrival.mkv</Table.Cell>
              <Table.Cell>
                <Badge tone="4K">4K</Badge>
              </Table.Cell>
              <Table.Cell>
                <Chip label="Remux" size="sm" dot="accent" />
              </Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table.Root>
      ),
    },
    {
      name: 'Without a header',
      docs: 'A table of two columns saying what something is and what it currently reads. The Root gives a bare row its position too, so the first one carries no rule whether or not a header was written.',
      render: ({ variant }) => (
        <Table.Root variant={variant} label="Transport">
          <Table.Row>
            <Table.Cell>Bandwidth</Table.Cell>
            <Table.Cell>9.40 Mb/s</Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell>Stalls</Table.Cell>
            <Table.Cell>1 (0.8s)</Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell>Container</Table.Cell>
            <Table.Cell>MKV</Table.Cell>
          </Table.Row>
        </Table.Root>
      ),
    },
    {
      name: 'A cell that wraps',
      docs: 'A long cell wraps inside its column rather than widening it past the ones beside it. Compose the cell where the wrapped text needs an ink of its own.',
      render: ({ variant }) => (
        <Table.Root variant={variant} label="Errors">
          <Table.Header>
            <Table.Row>
              <Table.Cell>Module</Table.Cell>
              <Table.Cell>Why it stopped</Table.Cell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            <Table.Row>
              <Table.Cell>tv.kroma.vpn</Table.Cell>
              <Table.Cell>
                <Text variant="body" color="danger">
                  The supervisor could not bind port 41312: another process is already listening on
                  it.
                </Text>
              </Table.Cell>
            </Table.Row>
            <Table.Row>
              <Table.Cell>tv.kroma.whisper</Table.Cell>
              <Table.Cell>Stopped by the operator.</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table.Root>
      ),
    },
  ],
});
