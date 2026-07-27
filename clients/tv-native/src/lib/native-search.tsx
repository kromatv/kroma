// Search chrome, the platform half. Apple TV only, and that is a finding rather
// than a shortcut.
//
// The shared search screen draws its own D-pad keyboard everywhere else, and it
// should: one layout, one look, one keyboard-layout preference across four
// shells. On Apple TV it costs too much. tvOS lends no microphone to apps, but
// its own keyboard hears the Siri Remote: hold the Siri button while a
// `UISearchController` is on screen and the words land in its field. Draw our
// own keyboard there and the device's only voice input disappears with it.
//
// So this registers the platform's search screen as the chrome (see the local
// `native-search` module for the UIKit side) and hands it our results grid to
// render inside. Typing and dictation are the system's; the posters, their
// focus and every query that follows are still the shared app's.

import type { SearchShell, SearchShellProps } from '@kroma/tv';
import { useCallback, useState } from 'react';
import { Platform, View } from 'react-native';
import { NativeSearchView } from '../../modules/native-search';

/** How much room tvOS left beside its keyboard. Nothing is rendered until it
 * has said so: React cannot guess a size the platform owns. */
interface Area {
  width: number;
  height: number;
}

function PlatformSearch({ value, onChange, placeholder, children }: Readonly<SearchShellProps>) {
  const [area, setArea] = useState<Area>({ width: 0, height: 0 });

  const onLayoutResults = useCallback(
    ({ nativeEvent }: { nativeEvent: Area }) =>
      setArea((current) =>
        current.width === nativeEvent.width && current.height === nativeEvent.height
          ? current
          : { width: nativeEvent.width, height: nativeEvent.height },
      ),
    [],
  );

  const onChangeText = useCallback(
    ({ nativeEvent }: { nativeEvent: { text: string } }) => onChange(nativeEvent.text),
    [onChange],
  );

  if (!NativeSearchView) return null;

  return (
    <NativeSearchView
      style={{ flex: 1 }}
      placeholder={placeholder}
      text={value}
      onChangeText={onChangeText}
      onLayoutResults={onLayoutResults}
    >
      {/* Sized to the results area rather than left to fill: these views are
          laid out against this screen, then re-parented into the search
          controller's smaller one, and only an explicit size survives that. */}
      {area.width > 0 ? (
        <View style={{ width: area.width, height: area.height, paddingHorizontal: EDGE }}>
          {children({ width: area.width - EDGE * 2, height: area.height })}
        </View>
      ) : null}
    </NativeSearchView>
  );
}

/** The only television here whose own keyboard is worth more than ours. */
const appleSearchShell: SearchShell = {
  available: () => NativeSearchView !== null,
  Shell: PlatformSearch,
};

/** The chrome for whichever television this build is running on, or null to keep
 * the shared on-screen keyboard. */
export const nativeSearchShell: SearchShell | null =
  Platform.OS === 'ios' ? appleSearchShell : null;

/** tvOS hands the results the full width and expects the app to keep its own
 * content off the overscan edge. The system chrome above (the field, the keys,
 * the rule under them) sits 80pt in, and the results scroller adds the last 20
 * of that itself, so this is what is left to make the two line up. */
const EDGE = 60;
