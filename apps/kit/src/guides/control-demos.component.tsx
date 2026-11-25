import { useEffect, useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Text } from '#ui/components/atoms/text';
import { CodeBlock } from '#ui/components/organisms/code-block';
import { space } from '#ui/core/tokens';
import {
  type ChangeDetails,
  type ControlProps,
  defineControl,
  useControl,
  useControlEngine,
} from '#ui/lib/control';
import type { ActReport, ControlRow } from '#ui/lib/inspect';
import { asLiteral } from './as-literal';

const volumeControl = defineControl('volume', {
  state: { value: 4 },
  options: { step: 1, max: 10 },
  actions: {
    louder: ({ value, step, max }) => ({ value: Math.min(max, value + step) }),
    quieter: ({ value, step }) => ({ value: Math.max(0, value - step) }),
    mute: () => ({ value: 0 }),
  },
});

const KEPT = 4;
const CALLS = ['louder', 'press'] as const;
const CALL_MIN = 260;

function Volume(props: Readonly<ControlProps<typeof volumeControl>>) {
  const [{ value, max, louder, quieter, mute }] = useControl(volumeControl, props);
  return (
    <Box row wrap align="center" gap={space[3]}>
      <Button label="Quieter" size="sm" variant="outline" onPress={quieter} />
      <Text variant="title">{`${value} / ${max}`}</Text>
      <Button label="Louder" size="sm" variant="outline" onPress={louder} />
      <Button label="Mute" size="sm" variant="outline" onPress={mute} />
    </Box>
  );
}

async function readVolume(): Promise<ControlRow | undefined> {
  const { snapshot } = await import('#ui/lib/inspect');
  return snapshot().find((row) => row.kind === 'volume');
}

function stepsOf(ref: string, action: string) {
  return { steps: [{ ref, action }] };
}

async function callVolume(ref: string, action: string): Promise<ActReport> {
  const { act } = await import('#ui/lib/inspect');
  return act(stepsOf(ref, action));
}

function useToolReading(): ControlRow | undefined {
  const engine = useControlEngine();
  const [row, setRow] = useState<ControlRow>();

  useEffect(() => {
    const refresh = () => {
      void readVolume().then(setRow);
    };
    refresh();
    return engine?.observe(refresh);
  }, [engine]);

  return row;
}

function Heading({ title, hint }: Readonly<{ title: string; hint: string }>) {
  return (
    <Box row wrap align="baseline" gapX={space[3]} gapY={space[1]}>
      <Text variant="overline" color="textDim">
        {title}
      </Text>
      <Text variant="meta" color="textDim">
        {hint}
      </Text>
    </Box>
  );
}

interface ReadoutProps {
  title: string;
  hint: string;
  code: string;
}

function Readout({ title, hint, code }: Readonly<ReadoutProps>) {
  return (
    <Box gap={space[2]}>
      <Heading title={title} hint={hint} />
      <CodeBlock code={code} numbers={false} />
    </Box>
  );
}

function ToolCall({ code, onRun }: Readonly<{ code: string; onRun: () => void }>) {
  return (
    <Box row wrap align="center" gap={space[3]}>
      <Box flex minW={CALL_MIN}>
        <CodeBlock code={code} numbers={false} />
      </Box>
      <Button label="Run" size="sm" icon="player-play" focusScale={1} onPress={onRun} />
    </Box>
  );
}

function ToolSide({ row }: Readonly<{ row: ControlRow }>) {
  const [report, setReport] = useState<ActReport>();
  const run = (action: string) => () => {
    void callVolume(row.ref, action).then(setReport);
  };

  return (
    <>
      <Readout title="What a tool reads" hint="Its row in snapshot()" code={asLiteral(row)} />
      <Box gap={space[2]}>
        <Heading title="What a tool calls" hint="From the page's console, or from here" />
        {CALLS.map((action) => (
          <ToolCall
            key={action}
            code={`await __KROMA_UI__.act(${asLiteral(stepsOf(row.ref, action))})`}
            onRun={run(action)}
          />
        ))}
      </Box>
      <Readout
        title="What the tool is told"
        hint="What act() answers"
        code={report ? asLiteral(report) : '// Run one of the two calls.'}
      />
    </>
  );
}

/** A control declared in the guide itself, with what the app hears of each
 * change, what a developer tool reads of it, and two calls a tool can make,
 * each shown as the code it is. */
function VolumeDemo() {
  const [heard, setHeard] = useState<readonly string[]>([]);
  const row = useToolReading();
  const hear = (next: number, { reason, source }: ChangeDetails) => {
    const line = `onValueChange(${next}, ${asLiteral({ reason, source })})`;
    setHeard((lines) => [...lines, line].slice(-KEPT));
  };

  return (
    <Box gap={space[5]}>
      <Volume onValueChange={hear} />
      <Readout
        title="What the app hears"
        hint="Its onValueChange, the last four calls"
        code={heard.join('\n') || '// Turn the volume up, or run a call.'}
      />
      {row ? <ToolSide row={row} /> : null}
    </Box>
  );
}

export { VolumeDemo };
