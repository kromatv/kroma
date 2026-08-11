import { Box, Column, Row } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { CopyButton } from '#ui/components/molecules/copy-button';

export function InstallCard({ url }: Readonly<{ url: string }>) {
  return (
    <Column gap={12}>
      <Txt variant="overline" color="accentText">
        Install
      </Txt>
      <Txt color="textMuted">
        Package Center → Settings → Package Sources → Add, then paste this URL.
      </Txt>
      <Box bg="surface1" p={16} radius="lg">
        <Row gap={12} between>
          <Box minW={0} shrink={1}>
            <Txt font="mono" lines={1}>
              {url}
            </Txt>
          </Box>
          <CopyButton value={url} label="Copy" copiedLabel="Copied" variant="primary" />
        </Row>
      </Box>
      <Txt color="textDim" variant="meta">
        KROMA shows up in the Community tab and updates itself with every release. Enable beta
        packages to follow the nightly channel.
      </Txt>
    </Column>
  );
}
