import { run } from '../run';

const ADDRESS = /\((\d+\.\d+\.\d+\.\d+)\)/;

export function parseArpTable(output: string): string[] {
  const hosts: string[] = [];
  for (const line of output.split('\n')) {
    if (line.includes('incomplete')) continue;
    const address = ADDRESS.exec(line)?.[1];
    if (address && !hosts.includes(address)) hosts.push(address);
  }
  return hosts;
}

/**
 * The addresses this machine has already talked to. Probing those first puts a
 * television on screen in the time one connect takes, rather than one sweep.
 */
export async function arpHosts(): Promise<string[]> {
  const { code, output } = await run(['arp', '-an'], { timeoutMs: 3000 });
  return code === 0 ? parseArpTable(output) : [];
}
