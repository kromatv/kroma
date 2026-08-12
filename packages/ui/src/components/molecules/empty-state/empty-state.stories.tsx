import { story } from '@kroma/workbench/story';
import { Button } from '#ui/components/atoms/button';
import { EmptyState, type EmptyStateLayout, type EmptyStateSize } from './empty-state';

export default story({
  name: 'EmptyState',
  group: 'Feedback',
  docs: 'The empty screen: a glyph in its well, what is missing, and why, in the same voice as the 404 and 500 pages. Two axes, and they are independent: `size` is how loud it reads (a list inside a section, a page, a page at ten feet), `layout` is where it sits (under what came before, or centred in the whole region it was given).',
  usage: `<EmptyState.Root icon="mood-empty">
  <EmptyState.Title>Aucun resultat</EmptyState.Title>
  <EmptyState.Hint>Essayez un autre terme.</EmptyState.Hint>
</EmptyState.Root>

<EmptyState.Root size="tv" layout="fill">
  <EmptyState.Media name="mood-empty" />
  <EmptyState.Title>Aucun resultat</EmptyState.Title>
  <EmptyState.Actions><Button label="Reessayer" onPress={retry} /></EmptyState.Actions>
</EmptyState.Root>`,
  guidelines: {
    do: [
      'Reach for `layout="fill"` only when the state IS the page - a whole screen with nothing on it.',
      'Put the raw cause in `<EmptyState.Detail>`: a status line, a path, an error message.',
      'Keep the mark on `icon`: it is an affordance, and `<EmptyState.Media>` is for media the kit cannot size.',
    ],
    dont: [
      'Don\'t use `size="md"` for a list inside a section; a second page-scale headline halfway down a screen reads as a heading.',
      "Don't write more than one action; the state offers the one thing to do.",
    ],
  },
  matrix: false,
  component: EmptyState.Root,
  args: {
    icon: 'mood-empty',
    size: 'md' as EmptyStateSize,
    layout: 'inline' as EmptyStateLayout,
  },
  controls: { icon: 'icon', size: ['sm', 'md', 'tv'], layout: ['inline', 'fill'] },
  render: (props) => (
    <EmptyState.Root {...props}>
      <EmptyState.Title>No results</EmptyState.Title>
      <EmptyState.Hint>Try another term, or check that the server is reachable.</EmptyState.Hint>
    </EmptyState.Root>
  ),
  scenes: [
    {
      name: 'With action',
      render: (props) => (
        <EmptyState.Root {...props}>
          <EmptyState.Title>No results</EmptyState.Title>
          <EmptyState.Hint>
            Try another term, or check that the server is reachable.
          </EmptyState.Hint>
          <EmptyState.Actions>
            <Button label="Retry" size="sm" />
          </EmptyState.Actions>
        </EmptyState.Root>
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
      example: () => (
        <EmptyState.Root layout="fill" icon="alert-triangle">
          <EmptyState.Title>Cette page n'a pas pu etre chargee</EmptyState.Title>
          <EmptyState.Hint>Le module est installe ; ses donnees n'ont pas repondu.</EmptyState.Hint>
          <EmptyState.Detail>GET /api/module/tv.kroma.remote/remote 502</EmptyState.Detail>
          <EmptyState.Actions>
            <Button variant="glass" size="sm" icon="refresh" label="Reessayer" />
          </EmptyState.Actions>
        </EmptyState.Root>
      ),
    },
    {
      name: 'Media of its own',
      docs: 'A mark the kit cannot size goes through `<EmptyState.Media>` rather than `icon`.',
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
