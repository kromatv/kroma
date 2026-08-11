// The type ramp, at both form factors.
//
// The 10-foot roles and the phone roles sit on one screen deliberately: they are
// one design system read from two distances, and seeing them together is how you
// catch a role that drifted on one side only.

import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import {
  BASE_RAMP,
  mobileType,
  mobileTypeSpec,
  TV_RAMP,
  type TypeSpec,
  typeSpec,
} from '#ui/core/tokens';

const SPECIMEN = 'Blade Runner 2049';

function metrics(spec: TypeSpec) {
  const em = 'em' in spec ? spec.em : undefined;
  const leading = `${Math.round(spec.size * spec.ratio)} (${spec.ratio})`;
  const track = em === undefined ? '' : ` · ${em > 0 ? '+' : ''}${em}em`;
  return `${spec.size} / ${spec.weight} · ${leading}${track}`;
}

function Row({
  name,
  detail,
  children,
}: Readonly<{ name: string; detail: string; children: React.ReactNode }>) {
  return (
    <Box row align="baseline" gap={24}>
      <Box w={132} shrink={0}>
        <Text variant="meta" color="textDim">
          {name}
        </Text>
        <Text variant="overline" color="textMuted">
          {detail}
        </Text>
      </Box>
      {children}
    </Box>
  );
}

function Section({
  title,
  hint,
  children,
}: Readonly<{ title: string; hint: string; children: React.ReactNode }>) {
  return (
    <Box gap={18}>
      <Box gap={4}>
        <Text variant="overline" color="accentText">
          {title}
        </Text>
        <Text variant="meta" color="textDim" maxW={620}>
          {hint}
        </Text>
      </Box>
      {children}
    </Box>
  );
}

export default story({
  name: 'Typography',
  group: 'Foundations',
  docs: 'Bricolage Grotesque for headings, Hanken Grotesk for everything else. Every step is a size AND its leading, so a call site never states either. The 10-foot ramp is drawn on the fixed 1920x1080 canvas, largest first; the mobile ramp is in real points.',
  matrix: false,
  render: () => (
    <Box gap={48}>
      <Section
        title="10-foot"
        hint="The ladder, in order. The display face runs from the pairing code down to a rail title; the ui face carries everything read as text. Reach for the neighbour above or below rather than a number."
      >
        {TV_RAMP.map((role) => {
          const spec = typeSpec[role];
          return (
            <Row key={role} name={role} detail={metrics(spec)}>
              <Text variant={role} lines={1}>
                {SPECIMEN}
              </Text>
            </Row>
          );
        })}
      </Section>
      <Section
        title="Base"
        hint="Arm's length: the web client, the desktop shell and the kit's own chrome. The same ladder in order, largest first, with the display face above and the ui face below."
      >
        {BASE_RAMP.map((role) => {
          const spec = typeSpec[role];
          return (
            <Row key={role} name={role} detail={metrics(spec)}>
              <Text variant={role} lines={1}>
                {SPECIMEN}
              </Text>
            </Row>
          );
        })}
      </Section>
      <Section title="Mobile" hint="Authored against real device points, with no stage in between.">
        {(Object.keys(mobileTypeSpec) as (keyof typeof mobileTypeSpec)[]).map((role) => {
          const spec = mobileTypeSpec[role];
          return (
            <Row key={role} name={role} detail={metrics(spec)}>
              <Text style={mobileType[role]} lines={1}>
                {SPECIMEN}
              </Text>
            </Row>
          );
        })}
      </Section>
    </Box>
  ),
});
