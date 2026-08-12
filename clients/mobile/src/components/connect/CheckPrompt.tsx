// The confirmation a television gets when the server could not place the origin
// its beacon was raised from: read the five characters off its screen and type
// them here.
//
// Shared by both places a phone can sign a television in - the connect screen's
// list and the cast picker - because the ask is the same one and a person who
// has met it once should not meet a second spelling of it.
//
// It asks for what only a screen in the room can show. A page wearing the same
// unplaceable origin can mint a beacon, but it has nowhere to print the code.

import type { DiscoveredTv, GrantResult } from '@kroma/core';
import { HANDOFF_CHECK_LENGTH } from '@kroma/core';
import { useCheckPrompt } from '@kroma/core/react';
import { Box, Button, OtpField, REGEXP_ONLY_DIGITS_AND_CHARS, styles, Text } from '@kroma/ui/kit';
import { useT } from '#mobile/lib/i18n';
import { spacing, type } from '#mobile/lib/theme';

export interface CheckPromptProps {
  device: DiscoveredTv;
  /** Grants with the code that was typed. Answers how it went, so the prompt
   * knows whether another code is worth asking for. */
  onGrant: (device: DiscoveredTv, check: string) => Promise<GrantResult>;
  onCancel: () => void;
}

export function CheckPrompt({ device, onGrant, onCancel }: Readonly<CheckPromptProps>) {
  const t = useT();
  const { code, setCode, busy, refused, submit } = useCheckPrompt({ device, onGrant });
  const asked = t('handoff.checkPrompt', { name: device.name });

  return (
    <Box style={s.prompt}>
      <Text style={s.title}>{asked}</Text>
      <OtpField.Root
        maxLength={HANDOFF_CHECK_LENGTH}
        value={code}
        onValueChange={setCode}
        onComplete={(value) => void submit(value)}
        pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
        physicalKeyboard
        autoFocus
        disabled={busy}
        invalid={refused !== null}
        label={asked}
      />
      <Text style={[s.hint, refused ? s.error : null]}>
        {refused ? t(`handoff.${refused}`) : t('handoff.checkHint')}
      </Text>
      <Button variant="ghost" size="sm" label={t('common.cancel')} onPress={onCancel} />
    </Box>
  );
}

const s = styles({
  prompt: { align: 'center', gap: spacing.md, py: spacing.lg },
  title: { ...type.section, color: 'text', textAlign: 'center' },
  hint: { ...type.caption, color: 'textMuted', textAlign: 'center' },
  error: { color: 'danger', fontWeight: '600' },
});
