// The type ramp, at both form factors.
//
// The 10-foot roles and the phone roles sit on one screen deliberately: they are
// one design system read from two distances, and seeing them together is how you
// catch a role that drifted on one side only.

import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { mobileType, type TypeRole, type as typeRoles } from '#ui/core/tokens';

const ROLES: TypeRole[] = ['hero', 'h1', 'h2', 'title', 'body', 'label', 'meta', 'overline'];

export default story({
  name: 'Typography',
  group: 'Foundations',
  docs: 'Bricolage Grotesque for headings, Hanken Grotesk for everything else. The 10-foot roles are drawn on the fixed 1920x1080 canvas; the mobile roles are in real points.',
  matrix: false,
  render: () => (
    <Box gap={40}>
      <Box gap={16}>
        <Txt variant="overline" color="accentText">
          10-foot
        </Txt>
        {ROLES.map((role) => (
          <Box key={role} row align="baseline" gap={24}>
            <Txt variant="meta" color="textDim" style={{ width: 96 }}>
              {role}
            </Txt>
            <Txt variant={role}>
              {`${typeRoles[role].fontSize}px / ${typeRoles[role].fontWeight}`}
            </Txt>
          </Box>
        ))}
      </Box>
      <Box gap={16}>
        <Txt variant="overline" color="accentText">
          Mobile
        </Txt>
        {(Object.keys(mobileType) as (keyof typeof mobileType)[]).map((role) => (
          <Box key={role} row align="baseline" gap={24}>
            <Txt variant="meta" color="textDim" style={{ width: 96 }}>
              {role}
            </Txt>
            <Txt style={mobileType[role]}>
              {`${mobileType[role].fontSize}px / ${mobileType[role].fontWeight}`}
            </Txt>
          </Box>
        ))}
      </Box>
    </Box>
  ),
});
