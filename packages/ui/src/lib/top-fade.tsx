import { type ReactNode, useState } from 'react';
import { type LayoutChangeEvent, type StyleProp, View, type ViewStyle } from 'react-native';
import { ScrolledReport } from '#ui/lib/scrolled-report';
import { TopFadeBand } from '#ui/lib/top-fade-band';

const FLEX: ViewStyle = { flex: 1, minHeight: 0 };

/** A page scroller's frame: once the `FocusScroll` or `VirtualGrid` inside it leaves its start, what scrolls up dissolves into `backdrop` (the screen's own layers, laid out against the frame's parent; the ground colour when omitted), hidden above `inset` and faded in below it. */
export function TopFade({
  inset = 0,
  backdrop,
  style,
  children,
}: Readonly<{
  inset?: number;
  backdrop?: ReactNode;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}>) {
  const [scrolled, setScrolled] = useState(false);
  const [top, setTop] = useState(0);
  return (
    <View style={style ?? FLEX} onLayout={(e: LayoutChangeEvent) => setTop(e.nativeEvent.layout.y)}>
      <ScrolledReport.Provider value={setScrolled}>{children}</ScrolledReport.Provider>
      <TopFadeBand inset={inset} active={scrolled} offset={top}>
        {backdrop}
      </TopFadeBand>
    </View>
  );
}
