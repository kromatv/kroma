import { story } from '@kroma/workbench/story';
import { Button } from '#ui/components/atoms/button';
import { Chip } from '#ui/components/atoms/chip';
import { PageHeader } from './page-header';

function Parts() {
  return (
    <PageHeader.Root>
      <PageHeader.Title suffix="12">Utilisateurs</PageHeader.Title>
      <PageHeader.Subtitle>Comptes et invitations</PageHeader.Subtitle>
      <PageHeader.Actions>
        <Chip variant="subtle" label="En direct" />
        <Button variant="primary" size="sm" icon="plus" label="Inviter" />
      </PageHeader.Actions>
    </PageHeader.Root>
  );
}

function Glyph() {
  return (
    <PageHeader.Root>
      <PageHeader.Title icon="flame">Tendances</PageHeader.Title>
      <PageHeader.Subtitle>Ce que le monde regarde cette semaine</PageHeader.Subtitle>
    </PageHeader.Root>
  );
}

export default story({
  name: 'PageHeader',
  group: 'Layout',
  docs: "A page's opening line: the display title (with an optional quiet `suffix` - a count, a category), a subtitle under it, and the page-level actions pinned to the other end. The title is a real **heading** to assistive tech, so a screen reader can land on it.\n\nComposed: `Root` owns the row, and `Title`, `Subtitle` and `Actions` are named parts. `Root` sorts its direct children once, so an `Actions` reaches the far end wherever it was written and everything else joins the title column - Yoga has no `order` to fix it afterwards.",
  usage: `<PageHeader.Root>
  <PageHeader.Title icon="flame">Tendances</PageHeader.Title>
  <PageHeader.Subtitle>Ce que le monde regarde</PageHeader.Subtitle>
  <PageHeader.Actions>
    <Button variant="primary" icon="plus" label="Inviter" onPress={invite} />
  </PageHeader.Actions>
</PageHeader.Root>`,
  guidelines: {
    do: [
      'One PageHeader per page, at the top - it is the h1.',
      'Put a glyph and a count on the title itself: `<PageHeader.Title icon suffix>`.',
      'Keep the actions to one cluster; a whole toolbar up here belongs under the header.',
    ],
    dont: [
      "Don't use it mid-page - that is a <Section>.",
      "Don't wrap <PageHeader.Actions> in a layout view: only a direct child is pinned to the far end.",
    ],
  },
  matrix: false,
  width: 'fill',
  args: { title: 'Utilisateurs', suffix: '12', subtitle: 'Comptes et invitations' },
  controls: { title: 'text', suffix: 'text', subtitle: 'text' },
  render: ({ title, suffix, subtitle }) => (
    <PageHeader.Root>
      <PageHeader.Title suffix={suffix || undefined}>{title}</PageHeader.Title>
      {subtitle ? <PageHeader.Subtitle>{subtitle}</PageHeader.Subtitle> : null}
      <PageHeader.Actions>
        <Button variant="primary" size="sm" icon="plus" label="Inviter" />
      </PageHeader.Actions>
    </PageHeader.Root>
  ),
  scenes: [
    {
      name: 'A cluster of actions',
      docs: '`Actions` is a cluster rather than a single slot, so a chip and a button share the end of the row without a layout view of their own.',
      example: () => <Parts />,
    },
    {
      name: 'A glyph in the title',
      docs: 'A page whose subject IS the glyph - trending, downloads, a live channel - takes it on the title, in the accent and at heading scale. It sits outside the heading text, so a screen reader still reads the words alone.',
      example: () => <Glyph />,
    },
  ],
});
