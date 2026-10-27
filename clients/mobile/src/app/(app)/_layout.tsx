import { activeTheme, color, useStyleScope, useThemeVersion } from '@kromatv/ui/kit';
import { Redirect, Stack } from 'expo-router';
import { lockUpright, PLAYER_ORIENTATION, UPRIGHT } from '#mobile/lib/orientation';
import { useSession } from '#mobile/lib/session';

/** Everything behind the auth gate: tabs, detail pages, the player. */
export default function AppLayout() {
  const scope = useStyleScope();
  useThemeVersion();

  const { status, serverUrl } = useSession();
  if (status === 'booting') return null;
  if (status !== 'signedIn') return <Redirect href={serverUrl ? '/sign-in' : '/connect'} />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color('bg', activeTheme(scope.theme)) },
        orientation: UPRIGHT,
      }}
    >
      <Stack.Screen
        name="player/[id]"
        dangerouslySingular
        listeners={{
          transitionEnd: ({ data }) => {
            if (data.closing) lockUpright();
          },
        }}
        options={{
          autoHideHomeIndicator: true,
          animation: 'fade',
          gestureEnabled: false,
          presentation: 'fullScreenModal',
          orientation: PLAYER_ORIENTATION,
        }}
      />
    </Stack>
  );
}
