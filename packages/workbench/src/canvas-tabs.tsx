// The row of views across the top of the canvas: the preview, the variant
// matrix, each hand-written scene and each worked example.

import { Box, Focusable, styles, sv, Text } from '@kroma/ui/kit';
import type { ColorToken } from '@kroma/ui/tokens';
import { ScrollView } from 'react-native';
import { RULE, TAB } from './chrome';
import type { WorkbenchLayout } from './layout';
import type { View } from './router';
import type { Story } from './story';

interface Tab {
  name: string;
  target: View;
  demo?: boolean;
}

function viewTabs(story: Story): Tab[] {
  return [
    { name: 'Preview', target: 'preview' },
    ...(story.matrix.length > 0 ? [{ name: 'Matrix', target: 'matrix' as View }] : []),
    ...story.scenes.map((scene, index) => ({
      name: scene.name,
      target: `scene:${index}` as View,
    })),
    ...story.demos.map((entry, index) => ({
      name: entry.name,
      target: `demo:${index}` as View,
      demo: true,
    })),
  ];
}

function CanvasTabs({
  story,
  view,
  onView,
  layout,
}: Readonly<{
  story: Story;
  view: View;
  onView: (next: View) => void;
  layout: WorkbenchLayout;
}>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={s.tabRow}
      contentContainerStyle={s.tabRowBody}
    >
      <Box row grow={1} gap={4} px={Math.max(0, layout.gutter - 12)} mt={14} style={RULE}>
        {viewTabs(story).map((tab) => {
          const active = view === tab.target;
          return (
            <Focusable
              key={tab.target}
              label={tab.name}
              ring={false}
              onPress={() => onView(tab.target)}
              sv={canvasTab}
              vars={{ active }}
            >
              {({ focused }) => (
                <Box row align="center" gap={7}>
                  {tab.demo ? (
                    <Box w={5} h={5} radius="pill" bg={tabInk(active, focused, 'accent')} />
                  ) : null}
                  <Text variant="meta" color={tabInk(active, focused, 'text')} style={s.tabLabel}>
                    {tab.name}
                  </Text>
                </Box>
              )}
            </Focusable>
          );
        })}
      </Box>
    </ScrollView>
  );
}

function tabInk(active: boolean, focused: boolean, selected: ColorToken): ColorToken {
  if (active) return selected;
  return focused ? 'textMuted' : 'textDim';
}

const s = styles({
  tabRow: { grow: 0, shrink: 0 },
  // `flexGrow` keeps the rule under the tabs running the full width of the
  // canvas when the tabs themselves do not fill it.
  tabRowBody: { grow: 1 },
  tabLabel: { fontSize: 13.5, fontWeight: '600' },
});
const canvasTab = sv({
  base: { ...TAB, _focus: { bg: 'white/6' } },
  variants: { active: { true: { borderBottomColor: 'accent' } } },
  defaults: { active: false },
});

export { CanvasTabs };
