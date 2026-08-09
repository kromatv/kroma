import { story } from '@kroma/workbench/story';
import { Button } from '#ui/components/atoms/button';
import { EmptyState } from './empty-state';

export default story({
  name: 'EmptyState',
  group: 'Feedback',
  docs: 'The empty screen: a glyph in its well, what is missing, and why, in the same voice as the 404 and 500 pages. `fill` makes the state THE page, centred in the space it was given; `detail` sets the raw cause apart in a chip. The tv variant scales everything up for the 10-foot viewing distance.',
  matrix: false,
  args: {
    icon: 'mood-empty',
    title: 'No results',
    hint: 'Try another term, or check that the server is reachable.',
    tv: false,
  },
  controls: { icon: 'icon' },
  render: (props) => <EmptyState {...props} />,
  scenes: [
    {
      name: 'With action',
      render: (props) => <EmptyState {...props} action={<Button label="Retry" size="sm" />} />,
    },
    {
      name: 'A failed page',
      docs: 'The module pages: the state fills the region and centres, the hint says what happened, the chip carries the raw cause, and retry is the one action. The same anatomy as the router error pages, minus the status number.',
      render: () => (
        <EmptyState
          fill
          icon="alert-triangle"
          title="Cette page n'a pas pu etre chargee"
          hint="Le module est installe ; ses donnees n'ont pas repondu."
          detail="GET /api/module/tv.kroma.remote/remote 502"
          action={<Button variant="glass" size="sm" icon="refresh" label="Reessayer" />}
        />
      ),
    },
  ],
});
