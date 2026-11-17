import { Box, Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { CopyButton } from '@kromatv/ui/kit/molecules/copy-button';

/** A value to paste somewhere else, under its name, with a button that copies it whole. */
export function CopyValue({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <Box bg="bg" border="border" radius="lg" px={14} py={10}>
      <Row gap={12} align="center">
        <Column gap={2} grow={1} shrink={1} minW={0}>
          <Text variant="overline" color="textDim">
            {label}
          </Text>
          <Text font="mono">{value}</Text>
        </Column>
        <Box shrink={0}>
          <CopyButton
            value={value}
            label={`Copy ${label.toLowerCase()}`}
            copiedLabel="Copied"
            failedLabel="Copy failed"
            iconOnly
          />
        </Box>
      </Row>
    </Box>
  );
}
