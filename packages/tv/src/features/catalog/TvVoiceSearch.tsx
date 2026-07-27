// The listening panel: what the user sees while the app holds the microphone.
//
// The platform half - the microphone itself, and how the words arrive - is a
// backend the shell registers; see `#tv/app/voiceSearch`. This file is only the
// design: a pulsing mic and the transcript filling in as it is understood.
//
// Every partial transcript goes straight to the search query, so the results
// grid behind fills in while the user is still talking - the same debounce as
// typing, from the same state.

import { useLocale, useT } from '@kroma/ui';
import { Box, Button, colors, Dialog, DialogFooter, Icon, Txt } from '@kroma/ui/kit';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import type { VoiceSearchBackend } from '#tv/app/voiceSearch';

export function TvVoiceSearch({
  backend,
  onText,
  onDone,
}: Readonly<{
  backend: VoiceSearchBackend;
  /** The transcript, pushed into the screen's query as it grows. */
  onText: (text: string) => void;
  /** Close the panel: a final result, a cancel, or a failure. */
  onDone: () => void;
}>) {
  const t = useT();
  const locale = useLocale();
  const [heard, setHeard] = useState('');
  const { Session } = backend;

  const hear = (text: string) => {
    setHeard(text);
    onText(text);
  };

  return (
    <Dialog open onClose={onDone} title={t('search.voice')} width={720}>
      <Box row align="center" gap={22}>
        <Pulse>
          <Icon name="microphone" size={34} color="accent" />
        </Pulse>
        <Box flex gap={6}>
          <Txt variant="h2" lines={2} color={heard ? 'text' : 'textMuted'}>
            {heard || t('search.voiceListening')}
          </Txt>
          <Txt variant="meta" color="textDim">
            {t('search.voiceHint')}
          </Txt>
        </Box>
      </Box>

      {/* The recogniser itself: no UI of its own, the panel is all there is. */}
      <Session onText={hear} onDone={onDone} locale={locale} />

      <DialogFooter>
        <Button variant="glass" label={t('common.cancel')} onPress={onDone} />
      </DialogFooter>
    </Dialog>
  );
}

const PULSE_MS = 900;
const CIRCLE = 76;

/** The listening cue: a slow breath on the mic disc. It is the only thing on a
 * silent screen that says the app is still hearing you, so it runs on the native
 * driver (scale and opacity only) and keeps animating no matter what the
 * JavaScript thread is doing with the incoming results. */
function Pulse({ children }: Readonly<{ children: React.ReactNode }>) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: PULSE_MS,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: PULSE_MS,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [value]);

  return (
    <Box style={{ width: CIRCLE, height: CIRCLE, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          HALO,
          {
            opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
            transform: [
              { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.3] }) },
            ],
          },
        ]}
      />
      <Box
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.accentSoft,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

const HALO = {
  position: 'absolute' as const,
  width: CIRCLE,
  height: CIRCLE,
  borderRadius: CIRCLE / 2,
  backgroundColor: '#F2B442',
};
