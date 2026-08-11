import { ChannelBadge } from '#site/components/channel-badge';
import { NotesAction } from '#site/components/notes-action';
import type { Release } from '#site/lib/release';
import { Box, Column, Row } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Txt } from '#ui/components/atoms/text';

export interface ReleaseHeadlineProps {
  label: string;
  release: Release;
}

export function ReleaseHeadline({ label, release }: Readonly<ReleaseHeadlineProps>) {
  return (
    <Box bg="surface1" p={20} radius="xl" grow={1} basis={280}>
      <Column gap={10}>
        <Row gap={8} between>
          <Box shrink={1} minW={0}>
            <Txt variant="overline" color="textDim" lines={1}>
              {label}
            </Txt>
          </Box>
          <ChannelBadge channel={release.channel} />
        </Row>
        <Txt variant="h2" font="mono" lines={1}>
          {release.version}
        </Txt>
        <Txt color="textMuted" variant="meta">
          {release.day} · {release.size}
        </Txt>
        <Row gap={8} mt={4} wrap>
          <Button variant="primary" size="sm" icon="download" href={release.spk} label="Download" />
          <NotesAction release={release} />
        </Row>
      </Column>
    </Box>
  );
}
