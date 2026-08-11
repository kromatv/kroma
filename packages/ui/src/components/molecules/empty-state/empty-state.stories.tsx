import { story } from '@kroma/workbench/story';
import { Button } from '#ui/components/atoms/button';
import { EmptyState, type EmptyStateLayout, type EmptyStateSize } from './empty-state';

export default story({
  name: 'EmptyState',
  group: 'Feedback',
  docs: 'The empty screen: a glyph in its well, what is missing, and why, in the same voice as the 404 and 500 pages. Two axes, and they are independent: `size` is how loud it reads (a list inside a section, a page, a page at ten feet), `layout` is where it sits (under what came before, or centred in the whole region it was given).',
  usage: `<EmptyState.Root icon="mood-empty" title="Aucun resultat" hint="Essayez un autre terme." />

<EmptyState.Root size="tv" layout="fill">
  <EmptyState.Media name="mood-empty" />
  <EmptyState.Title>Aucun resultat</EmptyState.Title>
  <EmptyState.Actions><Button label="Reessayer" onPress={retry} /></EmptyState.Actions>
</EmptyState.Root>`,
  guidelines: {
    do: [
      'Keep the one-liner for the common case: `icon`, `title` and `hint` render the same parts you would have written.',
      'Reach for `layout="fill"` only when the state IS the page - a whole screen with nothing on it.',
      'Put the raw cause in `detail`: a status line, a path, an error message.',
    ],
    dont: [
      'Don\'t use `size="md"` for a list inside a section; a second page-scale headline halfway down a screen reads as a heading.',
      "Don't write more than one action; the state offers the one thing to do.",
    ],
  },
  matrix: false,
  args: {
    icon: 'mood-empty',
    title: 'No results',
    hint: 'Try another term, or check that the server is reachable.',
    size: 'md' as EmptyStateSize,
    layout: 'inline' as EmptyStateLayout,
  },
  controls: { icon: 'icon', size: ['sm', 'md', 'tv'], layout: ['inline', 'fill'] },
  render: (props) => <EmptyState.Root {...props} />,
  scenes: [
    {
      name: 'With action',
      render: (props) => (
        <EmptyState.Root {...props} actions={<Button label="Retry" size="sm" />} />
      ),
    },
    {
      name: 'Inside a section',
      docs: 'The state stands in for a LIST under a heading, not for the screen: a smaller badge, a title sized to a section, and it sits straight under whatever introduced it.',
      args: { size: 'sm' },
    },
    {
      name: 'A failed page',
      docs: 'The module pages: the state fills the region and centres, the hint says what happened, the chip carries the raw cause, and retry is the one action. The same anatomy as the router error pages, minus the status number.',
      render: () => (
        <EmptyState.Root
          layout="fill"
          icon="alert-triangle"
          title="Cette page n'a pas pu etre chargee"
          hint="Le module est installe ; ses donnees n'ont pas repondu."
          detail="GET /api/module/tv.kroma.remote/remote 502"
          actions={<Button variant="glass" size="sm" icon="refresh" label="Reessayer" />}
        />
      ),
    },
    {
      name: 'Composed',
      docs: 'The same state written as its parts. Every sugar prop above is a shorthand for one of these, so nothing here is reachable only through the one-liner.',
      render: ({ size }) => (
        <EmptyState.Root size={size}>
          <EmptyState.Media name="mood-empty" />
          <EmptyState.Title>Aucun resultat</EmptyState.Title>
          <EmptyState.Hint>Essayez un autre terme.</EmptyState.Hint>
          <EmptyState.Actions>
            <Button variant="glass" size="sm" icon="refresh" label="Reessayer" />
          </EmptyState.Actions>
        </EmptyState.Root>
      ),
    },
  ],
});
