import { story } from '@kroma/workbench/story';
import { Txt } from '#ui/components/atoms/text';
import { Surface, surfaceVariants } from './surface';

export default story({
  name: 'Surface',
  group: 'Layout',
  docs: 'The elevated panel. Naming the combinations (background, radius, border, shadow) makes the elevation scale a design decision rather than a pile of tokens copied into every screen.',
  variants: surfaceVariants,
  args: { w: 260 },
  controls: { w: { min: 120, max: 480, step: 20 } },
  render: (props) => (
    <Surface {...props}>
      <Txt variant="meta" color="textMuted">
        Panel content
      </Txt>
    </Surface>
  ),
});
