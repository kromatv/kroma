import { useState } from 'react';
import { OtpField } from './otp-field';

function run(size: number, side: string) {
  return (
    <OtpField.Group>
      {Array.from({ length: size }, (_, at) => `${side}-${at}`).map((key) => (
        <OtpField.Slot key={key} />
      ))}
    </OtpField.Group>
  );
}

export function Grouped() {
  const [code, setCode] = useState('123');
  return (
    <OtpField.Root
      label="Verification code"
      maxLength={6}
      physicalKeyboard
      value={code}
      onValueChange={setCode}
    >
      {run(3, 'first')}
      <OtpField.Separator />
      {run(3, 'second')}
    </OtpField.Root>
  );
}
