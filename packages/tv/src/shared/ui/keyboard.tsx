// The TV's binding of the kit's <OnScreenKeyboard>: everything the keyboard
// itself does lives in @kroma/ui/kit, and this supplies the two things that
// are this app's, not the design system's — the device's persisted letter
// order and whether a real keyboard is attached.

import { OnScreenKeyboard as KitKeyboard } from '@kroma/ui/kit';
import { useState } from 'react';
import { getKeyboardLayoutPref } from '#tv/app/keyboardLayoutPref';
import { useEnv } from '#tv/app/providers/env';

interface OnScreenKeyboardProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  onClose?: () => void;
  layout?: 'url' | 'search';
  submitLabel?: string;
}

export function OnScreenKeyboard(props: Readonly<OnScreenKeyboardProps>) {
  const { physicalKeyboard } = useEnv();
  // Read once per mount, not per render: both keyboards re-render on every
  // keystroke, and the read is a blocking cross-process hop on old TV
  // webviews. The layout picker is a separate screen, so a changed value
  // still lands on the keyboard's next mount.
  const [letters] = useState(getKeyboardLayoutPref);
  // `tv`: these keys are read and aimed at from across a room.
  return <KitKeyboard {...props} size="tv" letters={letters} physicalKeyboard={physicalKeyboard} />;
}
