import { z } from 'zod';
import { act, callSchema } from './screen-act';
import { snapshot } from './screen-snapshot';
import { screenText } from './screen-text';

/** A tool as WebMCP's `registerTool` takes it. */
export type ScreenTool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean; debugging: true };
  execute: (input: unknown) => Promise<unknown>;
};

const NO_INPUT = { type: 'object', properties: {} };

const READS = { readOnlyHint: true, untrustedContentHint: true, debugging: true } as const;

const CHANGES = { readOnlyHint: false, untrustedContentHint: true, debugging: true } as const;

/** The screen as tools: the kit's reader and `act`, each with what an agent
 *  needs to know to call it. */
export const screenTools: readonly ScreenTool[] = [
  {
    name: 'read_screen',
    description:
      'Reads what the page shows, one kit component a line, indented by depth: its name, (focused) on the one that holds the focus, (clipped +WxH) on a text its box cuts off by W pixels across and H down, its box as x,y widthxheight, then its props. A component that runs a control has its ref after its name, [c4], and ends with its state and the actions change_controls can run on it now. Read it first, and again after a change.',
    inputSchema: NO_INPUT,
    annotations: READS,
    execute: async () => screenText(),
  },
  {
    name: 'list_controls',
    description:
      'Lists the controls on the page as JSON, in document order: the ref change_controls names each by, the component that runs it, its kind, its state, the actions it takes now, its box, and focused on the one that holds the focus. A ref stays the same for as long as its control is mounted.',
    inputSchema: NO_INPUT,
    annotations: READS,
    execute: async () => snapshot(),
  },
  {
    name: 'change_controls',
    description:
      'Changes what controls hold, by steps run in order. A step names a control by its ref, one of the actions it lists now, and the arguments that action takes. It calls the function the component itself calls on a press, so the page answers as it does to a person, and the app may refuse. The call stops at the first step that cannot run and says what to send instead; the steps before it stay done. Returns what each step did and the controls it named, as they read afterwards.',
    inputSchema: z.toJSONSchema(callSchema),
    annotations: CHANGES,
    execute: act,
  },
];
