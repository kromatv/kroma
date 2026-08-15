import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Text } from '#ui/components/atoms/text';
import { OtpField } from './otp-field';

type Status = 'idle' | 'checking' | 'wrong' | 'done';

const MESSAGE: Record<Status, string> = {
  idle: 'Enter the six digits we sent you. Try 123456.',
  checking: 'Checking...',
  wrong: 'That code is not right. Check it and try again.',
  done: 'Verified. Welcome back.',
};

/**
 * The whole shape of a code screen: auto-submit on the last digit, a busy state,
 * a rejected state that turns every slot red, and a way back. Type `123456` to
 * pass.
 *
 * @name Verify flow
 */
export default function Verify() {
  const [status, setStatus] = useState<Status>('idle');
  const [code, setCode] = useState('');

  const check = (entered: string) => {
    setStatus('checking');
    // A real screen calls the server here; the delay stands in for the round
    // trip, because a code field that never looks busy teaches the wrong thing.
    setTimeout(() => setStatus(entered === '123456' ? 'done' : 'wrong'), 700);
  };

  return (
    <Box gap={18} align="flex-start">
      <OtpField.Root
        maxLength={6}
        physicalKeyboard
        value={code}
        invalid={status === 'wrong'}
        disabled={status === 'checking' || status === 'done'}
        onValueChange={(next) => {
          setCode(next);
          setStatus('idle');
        }}
        onComplete={check}
      >
        <OtpField.Group>
          <OtpField.Slot />
          <OtpField.Slot />
          <OtpField.Slot />
        </OtpField.Group>
        <OtpField.Separator />
        <OtpField.Group>
          <OtpField.Slot />
          <OtpField.Slot />
          <OtpField.Slot />
        </OtpField.Group>
      </OtpField.Root>
      <Text variant="meta" color={status === 'wrong' ? 'danger' : 'textDim'}>
        {MESSAGE[status]}
      </Text>
      {status === 'wrong' || status === 'done' ? (
        <Button
          variant="ghost"
          size="sm"
          icon="repeat"
          label="Start over"
          onPress={() => {
            setCode('');
            setStatus('idle');
          }}
        />
      ) : null}
    </Box>
  );
}
