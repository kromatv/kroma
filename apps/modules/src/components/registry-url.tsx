import { Box, Column, Row } from '#ui/components/atoms/box';
import { Icon } from '#ui/components/atoms/icon';
import { Txt } from '#ui/components/atoms/text';
import { CopyButton } from '#ui/components/molecules/copy-button';

export interface RegistryUrlProps {
  url: string;
  note: string;
}

export function RegistryUrl({ url, note }: Readonly<RegistryUrlProps>) {
  return (
    <Column gap={12}>
      <Txt variant="overline" color="accentText">
        Registry URL
      </Txt>
      <Box bg="surface1" border="border" p={16} radius="lg">
        <Row gap={12}>
          <Icon name="link" size={18} color="accentText" />
          <Box grow={1} shrink={1} minW={0}>
            <Txt font="mono" lines={1}>
              {url}
            </Txt>
          </Box>
          <Box shrink={0}>
            <CopyButton value={url} label="Copy URL" copiedLabel="Copied" variant="primary" />
          </Box>
        </Row>
      </Box>
      <Row gap={6}>
        <Icon name="info-circle" size={14} color="textDim" />
        <Txt color="textDim" variant="meta">
          {note}
        </Txt>
      </Row>
    </Column>
  );
}
