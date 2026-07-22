import { Redirect, Stack } from 'expo-router';
import { isTablet } from '../../lib/layout';
import { useSession } from '../../lib/session';
import { colors } from '../../lib/theme';

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
      }}
    >
      <Stack.Screen
        name="player/[id]"
        options={{
          autoHideHomeIndicator: true,
          animation: 'fade',
          gestureEnabled: false,
          presentation: 'fullScreenModal',
          // Native per-screen orientation: the rotation happens as part of the
          // transition instead of an ugly post-mount flip. Tablets stay free.
          orientation: isTablet ? 'default' : 'landscape',
        }}
      />
    </Stack>
  );
}
