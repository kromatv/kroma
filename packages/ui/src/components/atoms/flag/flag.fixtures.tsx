import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { Flag } from './flag.component';
import { FLAG_SVG_REGIONS } from './flags';

export function Every({ height }: Readonly<{ height?: number }>) {
  return (
    <Box row wrap gap={16}>
      {FLAG_SVG_REGIONS.map((region) => (
        <Box key={region} align="center" gap={6}>
          <Flag region={region} height={height} />
          <Text variant="meta" color="textDim" font="mono">
            {region}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
