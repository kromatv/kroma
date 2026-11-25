import { Box } from '#ui/components/atoms/box';
import { Progress } from '#ui/components/atoms/progress';

/** Shared resume indicator at the lower edge of landscape and portrait artwork. */
export function CardProgress({ value }: Readonly<{ value: number | null }>) {
  if (value == null) {
    return null;
  }
  return (
    <Box absolute start={0} end={0} bottom={0} dir="ltr">
      <Progress value={value} rounded={false} />
    </Box>
  );
}
