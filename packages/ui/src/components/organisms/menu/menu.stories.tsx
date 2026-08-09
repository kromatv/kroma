import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { Menu } from './menu';

const noop = () => {};

export default story({
  name: 'Menu',
  group: 'Overlays',
  docs: 'The anchored action menu behind a "..." trigger: a download row\'s pause/retry/remove, a card\'s overflow. Under a pointer it is an anchored panel with the full **menu keyboard** - arrows, type-ahead, Enter fires, Esc returns to the trigger - announced as `role="menu"` through `aria-activedescendant`; under a D-pad the items open in a dialog, confined to the remote. Items are data (`icon`, `label`, `onSelect`, `disabled`, `danger`), with `\'separator\'` literals between groups; the destructive tail wears red.',
  usage: `<Menu
  label={t('downloads.rowActions')}
  align="end"
  items={[
    { icon: 'player-pause', label: 'Pause', onSelect: pause },
    { icon: 'refresh', label: 'Retry', onSelect: retry },
    'separator',
    { icon: 'trash', label: 'Remove', onSelect: remove, danger: true },
  ]}
/>`,
  guidelines: {
    do: [
      'Order by frequency, destructive last after a separator.',
      "Name the trigger with `label` - it is the icon button's accessible name too.",
    ],
    dont: [
      "Don't hide the row's ONE primary action in the overflow - promote it to its own button.",
      "Don't use a menu for navigation; menus fire actions.",
    ],
  },
  matrix: false,
  pad: 120,
  args: { align: 'end' as 'start' | 'end' },
  controls: { align: ['end', 'start'] },
  render: ({ align }) => (
    <Box row align="center" gap={16}>
      <Txt color="textMuted">Interstellar.2014.2160p.mkv</Txt>
      <Menu
        label="Row actions"
        align={align}
        items={[
          { icon: 'player-pause', label: 'Pause', onSelect: noop },
          { icon: 'users-plus', label: 'Ask for peers', onSelect: noop },
          { icon: 'refresh', label: 'Retry', onSelect: noop },
          'separator',
          { icon: 'trash', label: 'Remove', onSelect: noop, danger: true },
        ]}
      />
    </Box>
  ),
});
