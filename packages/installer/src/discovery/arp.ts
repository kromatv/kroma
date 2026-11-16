import { readFile } from 'node:fs/promises';
import { run } from '../shared/run';

const LINUX_TABLE = '/proc/net/arp';
const ARP_TIMEOUT_MS = 3000;
const BSD_ENTRY = /\((\d+\.\d+\.\d+\.\d+)\)/;
const WINDOWS_ENTRY = /^\s*(\d+\.\d+\.\d+\.\d+)\s+([\da-f]{2}(?:-[\da-f]{2}){5})\s/i;
const WINDOWS_UNRESOLVED = '00-00-00-00-00-00';
const LINUX_COMPLETE = 0x2;

export function parseBsdArp(output: string): string[] {
  const hosts: string[] = [];
  for (const line of output.split('\n')) {
    if (line.includes('incomplete')) {
      continue;
    }
    const address = BSD_ENTRY.exec(line)?.[1];
    if (address) {
      hosts.push(address);
    }
  }
  return unique(hosts);
}

export function parseLinuxArp(table: string): string[] {
  const hosts: string[] = [];
  for (const line of table.split('\n').slice(1)) {
    const [address, , flags] = line.trim().split(/\s+/);
    if (address && Number(flags) & LINUX_COMPLETE) {
      hosts.push(address);
    }
  }
  return unique(hosts);
}

export function parseWindowsArp(output: string): string[] {
  const hosts: string[] = [];
  for (const line of output.split('\n')) {
    const [, address, physical] = WINDOWS_ENTRY.exec(line) ?? [];
    if (address && physical !== WINDOWS_UNRESOLVED) {
      hosts.push(address);
    }
  }
  return unique(hosts);
}

/**
 * The addresses this machine has already talked to. Probing those first puts a
 * television on screen in the time one connect takes, rather than one sweep.
 * A table that cannot be read is an empty one.
 */
export async function arpHosts(): Promise<string[]> {
  try {
    return await readTable();
  } catch {
    return [];
  }
}

async function readTable(): Promise<string[]> {
  if (process.platform === 'linux') {
    return parseLinuxArp(await readFile(LINUX_TABLE, 'utf8'));
  }
  if (process.platform === 'win32') {
    return printed(['arp', '-a'], parseWindowsArp);
  }
  return printed(['arp', '-an'], parseBsdArp);
}

async function printed(
  command: readonly string[],
  parse: (output: string) => string[],
): Promise<string[]> {
  const { code, output } = await run(command, { timeoutMs: ARP_TIMEOUT_MS });
  return code === 0 ? parse(output) : [];
}

function unique(hosts: readonly string[]): string[] {
  return [...new Set(hosts)];
}
