import { story } from '@kroma/workbench/story';
import { Badge } from '#ui/components/atoms/badge';
import { Box } from '#ui/components/atoms/box';
import { IconButton } from '#ui/components/atoms/icon-button';
import { Tooltip } from './tooltip';

export default story({
  name: 'Tooltip',
  group: 'Overlays',
  docs: 'A short label over its child on hover or keyboard focus, after a beat. A pointer pattern: the bubble is `role="tooltip"` and named to the child through `aria-describedby` while it shows. On a television it renders nothing - there is no hover at three metres, so the ten-foot design says things in place instead - and the child keeps its own accessible label everywhere.',
  usage: `<Tooltip label={t('common.detection', { source })}>
  <Badge tone="H.265">H.265 OK</Badge>
</Tooltip>`,
  guidelines: {
    do: [
      'Use it for the secondary fact: where a value came from, what a glyph means.',
      'Keep it one line; a tooltip with structure is a popover asking to be designed.',
    ],
    dont: [
      "Don't put the ONLY copy of critical information in one - TVs and touch never see it.",
      "Don't tooltip a control that already says what it does.",
    ],
  },
  matrix: false,
  pad: 80,
  args: { label: 'Detected via MediaCapabilities' },
  controls: { label: 'text' },
  render: ({ label }) => (
    <Box row align="center" gap={16}>
      <Tooltip label={label}>
        <Badge tone="H.265">H.265 OK</Badge>
      </Tooltip>
      <Tooltip label="Refresh">
        <IconButton icon="refresh" label="Refresh" diameter={36} />
      </Tooltip>
    </Box>
  ),
});
