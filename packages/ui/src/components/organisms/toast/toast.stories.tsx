import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Toaster, toast } from './toast';

export default story({
  name: 'Toaster',
  group: 'State',
  docs: 'Transient notices, the shadcn/sonner shape: one `<Toaster/>` mounted by the shell, and `toast(...)` callable from anywhere. That split is the point — a cast receiver learning that a phone picked up its remote has no business knowing where notices are drawn. Written for the ten-foot case first: read from the sofa, never dismissed by hand, and `pointerEvents="none"` so it can never take the remote. It is not a dialog; nothing here is a question.',
  usage: `// once, near the root
<Toaster placement="top-right" />

// anywhere
toast({ message: 'iPhone connected', detail: 'maxime', icon: 'cast', tone: 'success' })`,
  guidelines: {
    do: [
      'Say what happened, in one line a viewer can read at three metres.',
      'Use `detail` for who or what it concerns, never for a second sentence.',
      'Leave placement at `top-right` on a television: notices belong beside the status cluster they are usually about.',
    ],
    dont: [
      "Don't ask a question with one - a choice needs a dialog that takes focus.",
      "Don't stack more than a few; the component caps what it draws for the same reason.",
      "Don't put an action inside one on a TV: nothing here can be clicked.",
    ],
  },
  matrix: false,
  args: {
    message: 'iPhone connected',
    detail: 'maxime',
    tone: 'success' as const,
  },
  controls: { tone: ['plain', 'success', 'accent'] },
  render: ({ message, detail, tone }) => (
    <Box gap={16}>
      <Button
        label="Say it"
        onPress={() => toast({ message, detail, icon: 'cast', tone, duration: 3000 })}
      />
      <Toaster placement="top-right" />
    </Box>
  ),
  scenes: [
    {
      name: 'A remote joins',
      docs: 'What a television shows when somebody picks up its remote.',
      render: () => (
        <Box gap={16}>
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
          <Toaster placement="top-right" />
        </Box>
      ),
    },
    {
      name: 'On a phone',
      docs: 'The same component at the bottom, where a hand-held expects it.',
      render: () => (
        <Box gap={16}>
          <Button
            label="Say it"
            onPress={() => toast({ message: 'Playing on Salon', icon: 'device-tv' })}
          />
          <Toaster placement="bottom-center" inset={24} />
        </Box>
      ),
    },
  ],
});
