import { Box, styles, useStyles } from '@kromatv/ui/kit';
import type { ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function PlayerLayout({
  fullscreen,
  video,
  header,
  transport,
  details,
  children,
}: Readonly<{
  fullscreen: boolean;
  video: ReactNode;
  header: ReactNode;
  transport: ReactNode;
  details: ReactNode;
  children: ReactNode;
}>) {
  const s = useStyles(definition);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const videoHeight = Math.min((width * 9) / 16, (height - insets.top - insets.bottom) * 0.55);
  return (
    <Box style={[s.stage, !fullscreen && { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {!fullscreen ? header : null}
      <Box key="video" style={[s.video, fullscreen ? s.fullscreen : { height: videoHeight }]}>
        {video}
      </Box>
      {!fullscreen ? transport : null}
      {!fullscreen ? details : null}
      {children}
    </Box>
  );
}

const definition = styles({
  stage: { flex: true, bg: 'bg' },
  video: { w: '100%', bg: 'black' },
  fullscreen: { flex: true },
});
