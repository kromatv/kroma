import { Redirect, Stack } from 'expo-router';
import { isTablet } from '#mobile/lib/layout';
import { useSession } from '#mobile/lib/session';
import { colors } from '#mobile/lib/theme';

/** Everything behind the auth gate: tabs, detail pages, the player. */
export default function AppLayout() {
  const { status, serverUrl } = useSession();
  if (status === 'booting') return null;
  if (status !== 'signedIn') return <Redirect href={serverUrl ? '/sign-in' : '/connect'} />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        orientation: isTablet ? 'default' : 'portrait',
      }}
    >
      <Stack.Screen
        name="player/[id]"
        options={{
          autoHideHomeIndicator: true,
          animation: 'fade',
          gestureEnabled: false,
          presentation: 'fullScreenModal',
          // Per-screen orientation rotates during the transition rather than as a
          // post-mount flip.
          orientation: isTablet ? 'default' : 'landscape',
        }}
      />
    </Stack>
  );
}
