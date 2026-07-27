import { story } from '@kroma/workbench/story';
import { type TypeRole, type as typeRoles } from '#ui/lib/tokens';
import { Txt } from './text';

const ROLES = Object.keys(typeRoles) as TypeRole[];

export default story({
  name: 'Txt',
  group: 'Foundations',
  docs: 'All text in the kit goes through here. The variant names a design ROLE, not a size: that is what makes the type ramp adjustable in a single place.',
  matrix: false,
  args: {
    variant: 'body',
    color: 'text',
    children: 'The quick brown fox jumps over the lazy dog',
    lines: 0,
  },
  controls: {
    variant: ROLES,
    color: ['text', 'textMuted', 'textDim', 'accent', 'danger', 'success'],
    lines: { min: 0, max: 4, step: 1 },
  },
  render: ({ children, lines, ...props }) => (
    <Txt {...props} lines={lines || undefined}>
      {children}
    </Txt>
  ),
});
