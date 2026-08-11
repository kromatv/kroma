import { Box, Column, Row } from '#ui/components/atoms/box';
import { Icon } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { CopyButton } from '#ui/components/molecules/copy-button';

export interface RegistryUrlProps {
  url: string;
  note: string;
}

export function RegistryUrl({ url, note }: Readonly<RegistryUrlProps>) {
  return (
    <Column gap={12}>
      <Text variant="overline" color="accentText">
        Registry URL
      </Text>
      <Box bg="surface1" border="border" p={16} radius="lg">
        <Row gap={12}>
          <Icon name="link" size={18} color="accentText" />
          <Box grow={1} shrink={1} minW={0}>
            <Text font="mono" lines={1}>
              {url}
            </Text>
          </Box>
          <Box shrink={0}>
            <CopyButton value={url} label="Copy URL" copiedLabel="Copied" variant="primary" />
          </Box>
        </Row>
      </Box>
      <Row gap={6}>
        <Icon name="info-circle" size={14} color="textDim" />
        <Text color="textDim" variant="meta">
          {note}
        </Text>
      </Row>
    </Column>
  );
}
