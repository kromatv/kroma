import { story } from '@kroma/workbench/story';
import { Button } from '#ui/components/atoms/button';
import { PageHeader } from './page-header';

export default story({
  name: 'PageHeader',
  group: 'Layout',
  docs: "A page's opening line: the display title (with an optional quiet `suffix` - a count, a category), a subtitle under it, and the page-level `action` pinned to the other end. The title is a real **heading** to assistive tech, so a screen reader can land on it. The action slot usually holds the page's one primary button; a live page pins its realtime chip there instead.",
  usage: `<PageHeader
  title="Utilisateurs"
  suffix="12"
  subtitle="Comptes et invitations"
  action={<Button variant="primary" icon="plus" label="Inviter" onPress={invite} />}
/>`,
  guidelines: {
    do: [
      'One PageHeader per page, at the top - it is the h1.',
      'Keep the action singular; a row of buttons up here is a toolbar, not a header.',
    ],
    dont: ["Don't use it mid-page - that is a <Section> title."],
  },
  matrix: false,
  width: 'fill',
  args: { title: 'Utilisateurs', suffix: '12', subtitle: 'Comptes et invitations' },
  controls: { title: 'text', suffix: 'text', subtitle: 'text' },
  render: ({ title, suffix, subtitle }) => (
    <PageHeader
      title={title}
      suffix={suffix || undefined}
      subtitle={subtitle || undefined}
      action={<Button variant="primary" size="sm" icon="plus" label="Inviter" />}
    />
  ),
});
