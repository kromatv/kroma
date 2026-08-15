import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { BASE_RAMP, type RadiusToken, radius, space, typeSpec } from '#ui/core/tokens';

// The specimen every step is set in: a real phrase rather than a pangram, so the
// steps are compared on the letters the product actually draws.
const SPECIMEN = 'Direct play';

const NAME_COLUMN = 96;

/** The base type ramp, drawn from the ramp itself: a step added to
 * `typography.ts` appears here without anything being listed twice. */
function TypeRamp() {
  return (
    <Box gap={space[4]}>
      {BASE_RAMP.map((role) => {
        const spec = typeSpec[role];
        return (
          <Box key={role} row align="baseline" gap={space[4]}>
            <Text variant="meta" color="textDim" w={NAME_COLUMN}>
              {role}
            </Text>
            <Box flex>
              <Text variant={role}>{SPECIMEN}</Text>
            </Box>
            <Text variant="meta" color="textDim">
              {`${spec.size} / ${Math.round(spec.size * spec.ratio)}`}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

/** The spacing scale at its own sizes. */
function SpaceScale() {
  return (
    <Box gap={space[2]}>
      {Object.entries(space).map(([step, value]) => (
        <Box key={step} row align="center" gap={space[4]}>
          <Text variant="meta" color="textDim" w={NAME_COLUMN}>
            {`space[${step}]`}
          </Text>
          <Box h={10} w={value} bg="accent" radius="xs" />
          <Text variant="meta" color="textDim">
            {value}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

/** The corner language, one swatch per token. */
function RadiusScale() {
  return (
    <Box row wrap gapX={space[4]} gapY={space[4]}>
      {Object.entries(radius).map(([name, value]) => (
        <Box key={name} align="center" gap={space[2]}>
          <Box w={72} h={48} bg="surface3" radius={name as RadiusToken} style={s.swatch} />
          <Text variant="meta" color="textDim">
            {name}
          </Text>
          <Text variant="meta" color="textDim">
            {value}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

const s = styles({
  swatch: { borderWidth: 1, borderColor: 'borderStrong' },
});

export { RadiusScale, SpaceScale, TypeRamp };
