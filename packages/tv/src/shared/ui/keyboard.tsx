// The TV's binding of the kit's two remote keyboards: everything the keyboards
// themselves do lives in @kroma/ui/kit, and this supplies the two things that
// are this app's, not the design system's — the device's persisted letter
// order and whether a real keyboard is attached.

import {
  SearchKeyboard as KitSearchKeyboard,
  UrlKeyboard as KitUrlKeyboard,
  type SearchKeyboardProps,
  type UrlKeyboardProps,
} from '@kroma/ui/kit';
import { useState } from 'react';
import { getKeyboardLayoutPref } from '#tv/app/keyboardLayoutPref';
import { useEnv } from '#tv/app/providers/env';

type TvKeyboardProps<P> = Omit<P, 'letters' | 'physicalKeyboard' | 'size'>;

// Read once per mount, not per render: both keyboards re-render on every
// keystroke, and the read is a blocking cross-process hop on old TV
// webviews. The layout picker is a separate screen, so a changed value
// still lands on the keyboard's next mount.
function useTvKeyboard() {
  const { physicalKeyboard } = useEnv();
  const [letters] = useState(getKeyboardLayoutPref);
  // `tv`: these keys are read and aimed at from across a room.
  return { letters, physicalKeyboard, size: 'tv' } as const;
}

export function SearchKeyboard(props: Readonly<TvKeyboardProps<SearchKeyboardProps>>) {
  const device = useTvKeyboard();
  return <KitSearchKeyboard {...props} {...device} />;
}

export function UrlKeyboard(props: Readonly<TvKeyboardProps<UrlKeyboardProps>>) {
  const device = useTvKeyboard();
  return <KitUrlKeyboard {...props} {...device} />;
}
