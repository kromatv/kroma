import { story } from '@kroma/workbench/story';
import { Box, Row } from '#ui/components/atoms/box';
import { Surface } from '#ui/components/atoms/surface';
import { Text } from '#ui/components/atoms/text';
import type { ControlSize } from '#ui/lib/field-shell';
import { ThemeSwitch } from './theme-switch';

const SIZES: ControlSize[] = ['sm', 'md', 'tv'];

const EN = { system: 'Auto', light: 'Light', dark: 'Dark' };

export default story({
  name: 'ThemeSwitch',
  group: 'Input',
  docs: "Dark, light, or whatever the device says: the product's one appearance control, and a live one - press it here and the workbench itself changes ground. It is a `<SegmentedControl>` with the glyphs standing in for the words, so `labels` is not decoration but the accessible name of each of the three modes. The mode is persisted where the PLATFORM can act on it: a cookie on the web, so the server stamps the chosen ground into the HTML and the first paint is already right, and the device store on native. It is read in an effect rather than during render, because a server and a client that disagree about the first frame is a hydration warning; and while the choice is `system`, an `Appearance` listener keeps following the device after the page has loaded, so a Mac turning dark at sunset turns this dark with it.",
  usage: `<ThemeSwitch labels={{ system: 'Auto', light: 'Light', dark: 'Dark' }} />

// In an app with a catalogue, which is every client:
<ThemeSwitch
  label={t('appearance.title')}
  labels={{
    system: t('appearance.system'),
    light: t('appearance.light'),
    dark: t('appearance.dark'),
  }}
/>`,
  guidelines: {
    do: [
      'Pass `labels` in the app language: nothing draws them, and they are all a screen reader has to tell the three glyphs apart.',
      'Keep `system` in the set. It is the default, and it is the only one that keeps following the device after the fact.',
      'Read the cookie on the server and stamp the ground on the document, or the page paints dark and then jumps.',
    ],
    dont: [
      "Don't put two on one screen. Each holds its own selection, read once when it mounts, so pressing one leaves the other's lit segment stale while the ground moves under both.",
      "Don't wire your own state to it: the control owns the mode, and a second copy of it is a second answer to the same question.",
      "Don't use it to pin one part of a screen to a ground. That is `<Ground>`, which scopes rather than switches.",
    ],
  },
  matrix: false,
  component: ThemeSwitch,
  args: { size: 'sm' as ControlSize, label: 'Theme', labels: EN },
  controls: { size: SIZES },
  scenes: [
    {
      name: 'In a settings row',
      docs: "How both shells that have one wear it: a row that names the setting, with the control at the end and nothing about the row itself pressable. The phone's settings and the sites' headers are this same arrangement at two widths.",
      example: () => (
        <Surface pad="none" w={420}>
          <Row justify="space-between" gap={16} px={18} py={14}>
            <Box flex gap={2}>
              <Text variant="label">Appearance</Text>
              <Text variant="meta" color="textMuted">
                Follows the device unless you say otherwise.
              </Text>
            </Box>
            <ThemeSwitch label="Appearance" labels={EN} />
          </Row>
        </Surface>
      ),
    },
  ],
});
