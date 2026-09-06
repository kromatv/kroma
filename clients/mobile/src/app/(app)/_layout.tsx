import { color } from '@kroma/ui/kit';
import { Redirect, Stack } from 'expo-router';
import { PLAYER_ORIENTATION, UPRIGHT } from '#mobile/lib/orientation';
import { useSession } from '#mobile/lib/session';

/** Everything behind the auth gate: tabs, detail pages, the player. */
export default function AppLayout() {
  const { status, serverUrl } = useSession();
  if (status === 'booting') return null;
  if (status !== 'signedIn') return <Redirect href={serverUrl ? '/sign-in' : '/connect'} />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color('bg') },
        orientation: UPRIGHT,
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
          orientation: PLAYER_ORIENTATION,
        }}
      />
    </Stack>
  );
}
