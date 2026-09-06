// The listening panel: what the user sees while the app holds the
// microphone. The platform half (the microphone itself, and how the words
// arrive) is a backend the shell registers; see `#tv/app/voiceSearch`.

import { useLocale, useT } from '@kroma/ui';
import { Box, Button, Dialog, Icon, styles, Text, useLoop } from '@kroma/ui/kit';
import { useState } from 'react';
import { Animated } from 'react-native';
import type { VoiceSearchBackend } from '#tv/app/voiceSearch';

export function TvVoiceSearch({
  backend,
  onText,
  onDone,
}: Readonly<{
  backend: VoiceSearchBackend;
  onText: (text: string) => void;
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
    <Dialog.Root open onClose={onDone} title={t('search.voice')} width="lg">
      <Box row align="center" gap={22}>
        <Pulse>
          <Icon name="microphone" size={34} color="accentText" />
        </Pulse>
        <Box flex gap={6}>
          <Text variant="h2" lines={2} color={heard ? 'text' : 'textMuted'}>
            {heard || t('search.voiceListening')}
          </Text>
          <Text variant="meta" color="textDim">
            {t('search.voiceHint')}
          </Text>
        </Box>
      </Box>

      {/* The recogniser itself: no UI of its own, the panel is all there is. */}
      <Session onText={hear} onDone={onDone} locale={locale} />

      <Dialog.Actions>
        <Button variant="glass" label={t('common.cancel')} onPress={onDone} />
      </Dialog.Actions>
    </Dialog.Root>
  );
}

const PULSE_MS = 1800;
const CIRCLE = 76;

function Pulse({ children }: Readonly<{ children: React.ReactNode }>) {
  const halo = useLoop('halo', PULSE_MS);

  return (
    <Box w={CIRCLE} h={CIRCLE} center>
      <Animated.View style={[s.halo, halo]} />
      <Box style={s.well}>{children}</Box>
    </Box>
  );
}

const s = styles({
  well: { w: 56, h: 56, radius: 28, center: true, bg: 'accentSoft' },
  halo: { absolute: true, w: CIRCLE, h: CIRCLE, radius: CIRCLE / 2, bg: 'accentWash' },
});
