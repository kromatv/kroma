import { Box, Icon, StatusDot } from '@kromatv/ui/kit';

/** The top bar's server indicator: a dot while the server answers, a wifi-off
 * badge while the heartbeat cannot reach it. The badge holds still, so a
 * television left offline does not redraw the screen every frame. */
export function ConnectionStatus({ online, label }: Readonly<{ online: boolean; label: string }>) {
  if (online) return <StatusDot online overArt />;
  return (
    <Box w={36} h={36} center accessibilityLabel={label} accessibilityRole="progressbar">
      <Box absolute w={34} h={34} radius="circle" borderWidth={2} border="danger/24" />
      <Box w={28} h={28} center radius="pill" bg="danger">
        <Icon name="wifi-off" size={16} thickness={2.2} color="white" />
      </Box>
    </Box>
  );
}
