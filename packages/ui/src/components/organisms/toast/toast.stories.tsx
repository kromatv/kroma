import { story } from '@kroma/workbench/story';
import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Toaster, type ToastPosition, toast } from './toast';

// The story's stand-in for a screen. <Toaster/> is a full-bleed layer over its
// parent, so a demo has to give it one; the app gives it the view the shell
// fills. The triggers sit in a padded sibling, never around the host.
function Screen({
  height = 340,
  position,
  children,
}: Readonly<{ height?: number; position?: ToastPosition; children: ReactNode }>) {
  return (
    <Box h={height} radius="lg" bg="surface1" border="border" overflow="hidden">
      <Box flex p={20} gap={12} align="flex-start" justify="center">
        {children}
      </Box>
      <Toaster position={position} inset={16} />
    </Box>
  );
}

const POSITIONS: ToastPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

export default story({
  name: 'Toaster',
  group: 'Overlays',
  docs: 'Transient notices, the shadcn/sonner shape: one `<Toaster/>` mounted by the shell, and `toast(...)` callable from anywhere. That split is the point, since a cast receiver learning that a phone picked up its remote has no business knowing where notices are drawn. The host is a full-bleed layer over its parent rather than a window portal, so it pins to the viewport in an app and stays inside the stage here. Written for the ten-foot case first: read from the sofa, never dismissed by hand, and `pointerEvents="none"` so it can never take the remote. It is not a dialog; nothing here is a question.',
  usage: `// once, in the view that fills the screen
<Toaster position="top-right" />

// anywhere
toast({ message: 'iPhone connected', detail: 'maxime', icon: 'cast', tone: 'success' })

// and the rare notice that belongs somewhere else
toast({ message: 'Link copied', position: 'bottom-center' })`,
  guidelines: {
    do: [
      'Say what happened, in one line a viewer can read at three metres.',
      'Use `detail` for who or what it concerns, never for a second sentence.',
      'Leave `position` at `top-right` on a television: notices belong beside the status cluster they are usually about.',
      "Pass a phone's safe-area insets as `inset={{ top, bottom }}` when the shell draws edge to edge, or mount the host inside its safe frame.",
    ],
    dont: [
      "Don't ask a question with one - a choice needs a dialog that takes focus.",
      "Don't stack more than a few; the component caps each corner for the same reason.",
      "Don't spread an app's notices over the six corners: the shell owns one, and a single notice overrides it.",
      "Don't put an action inside one on a TV: nothing here can be clicked.",
    ],
  },
  matrix: false,
  width: 'fill',
  args: {
    message: 'iPhone connected',
    detail: 'maxime',
    tone: 'success' as const,
    position: 'top-right' as ToastPosition,
  },
  controls: { tone: ['plain', 'success', 'accent'], position: POSITIONS },
  render: ({ message, detail, tone, position }) => (
    <Screen position={position}>
      <Button
        label="Say it"
        onPress={() => toast({ message, detail, icon: 'cast', tone, duration: 3000 })}
      />
    </Screen>
  ),
  scenes: [
    {
      name: 'A remote joins',
      docs: 'What a television shows when somebody picks up its remote, and why the default is top-right: a notice about the status cluster belongs beside it, not over the row the viewer is browsing.',
      render: () => (
        <Screen position="top-right">
          <Button
            label="Connect"
            onPress={() =>
              toast({
                message: 'iPhone connected',
                detail: 'maxime',
                icon: 'cast',
                tone: 'success',
              })
            }
          />
        </Screen>
      ),
    },
    {
      name: 'On a phone',
      docs: 'The bottom is where a hand-held expects a notice: it is where the thumb already is, and it is the edge the notch is not on.',
      render: () => (
        <Screen position="bottom-center">
          <Button
            label="Say it"
            onPress={() => toast({ message: 'Playing on Salon', icon: 'device-tv' })}
          />
        </Screen>
      ),
    },
    {
      name: 'The six corners',
      docs: 'One host serves the lot, because a notice that names its own position beats the shell it was mounted with. Compare them side by side before choosing: a corner is a promise about what the notice is allowed to cover.',
      render: () => (
        <Screen height={420}>
          <Box row wrap gap={10}>
            {POSITIONS.map((position) => (
              <Button
                key={position}
                variant="glass"
                size="sm"
                label={position}
                onPress={() => toast({ message: position, icon: 'cast', position })}
              />
            ))}
            <Button
              variant="primary"
              size="sm"
              label="All six"
              onPress={() => {
                for (const position of POSITIONS) {
                  toast({ message: position, icon: 'cast', position });
                }
              }}
            />
          </Box>
        </Screen>
      ),
    },
    {
      name: 'Newest nearest the edge',
      docs: 'Stacking is a mirror rather than a rule to remember: whichever edge a column is anchored to, the newest notice is the one against it, so the eye lands on the thing that just happened.',
      render: () => (
        <Screen height={420}>
          <Box row wrap gap={10}>
            <Button
              variant="glass"
              size="sm"
              label="Three at the top"
              onPress={() => {
                for (const step of ['First', 'Second', 'Third']) {
                  toast({ message: step, position: 'top-left', duration: 8000 });
                }
              }}
            />
            <Button
              variant="glass"
              size="sm"
              label="Three at the bottom"
              onPress={() => {
                for (const step of ['First', 'Second', 'Third']) {
                  toast({ message: step, position: 'bottom-right', duration: 8000 });
                }
              }}
            />
          </Box>
        </Screen>
      ),
    },
  ],
});
