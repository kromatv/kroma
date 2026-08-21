import { Box, Column, Row } from '@kroma/ui/kit/atoms/box';
import { Text } from '@kroma/ui/kit/atoms/text';
import { CopyButton } from '@kroma/ui/kit/molecules/copy-button';

export function InstallCard({ url }: Readonly<{ url: string }>) {
  return (
    <Column gap={12}>
      <Text variant="overline" color="accentText">
        Install
      </Text>
      <Text color="textMuted">
        Package Center → Settings → Package Sources → Add, then paste this URL.
      </Text>
      <Box bg="surface1" p={16} radius="lg">
        <Row gap={12} between>
          <Box minW={0} shrink={1}>
            <Text font="mono" lines={1}>
              {url}
            </Text>
          </Box>
          <CopyButton value={url} label="Copy" copiedLabel="Copied" variant="primary" />
        </Row>
      </Box>
      <Text color="textDim" variant="meta">
        KROMA shows up in the Community tab and updates itself with every release. Enable beta
        packages to follow the canary channel.
      </Text>
    </Column>
  );
}
