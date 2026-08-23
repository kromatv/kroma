import { describe, expect, it } from 'vitest';
import { injectUsage, renderUsage, type UsageCommand } from './usage';

const TV: UsageCommand = {
  meta: { name: 'tv', description: 'find televisions and install KROMA' },
  args: {
    host: { type: 'string', description: 'probe these addresses', valueHint: 'ip' },
    launch: { type: 'boolean', default: true, description: 'start the app after installing' },
    json: { type: 'boolean', description: 'machine readable output' },
  },
  subCommands: {
    scan: { meta: { description: 'list what answered' } },
    install: {
      meta: { description: 'install without the TUI' },
      args: { target: { type: 'positional', description: 'an address, or all' } },
    },
  },
};

describe('renderUsage', () => {
  it('lists the root command and every subcommand with its description', async () => {
    const usage = await renderUsage(TV, 'bun run tv');

    expect(usage).toContain('| `bun run tv` | find televisions and install KROMA |');
    expect(usage).toContain('| `bun run tv scan` | list what answered |');
  });

  it('spells a subcommand with the positional it takes', async () => {
    const usage = await renderUsage(TV, 'bun run tv');

    expect(usage).toContain('| `bun run tv install <target>` |');
  });

  it('gives a boolean that defaults on both of its spellings', async () => {
    const usage = await renderUsage(TV, 'bun run tv');

    expect(usage).toContain('| `--launch`, `--no-launch` | start the app after installing |');
    expect(usage).toContain('| `--json` | machine readable output |');
  });

  it('names the value a flag takes', async () => {
    const usage = await renderUsage(TV, 'bun run tv');

    expect(usage).toContain('| `--host <ip>` | probe these addresses |');
  });

  it('resolves a description a command only produces when asked', async () => {
    const lazy: UsageCommand = {
      meta: () => Promise.resolve({ description: 'resolved late' }),
      subCommands: { doctor: () => ({ meta: { description: 'which tools are here' } }) },
    };

    const usage = await renderUsage(lazy, 'tv');

    expect(usage).toContain('| `tv` | resolved late |');
    expect(usage).toContain('| `tv doctor` | which tools are here |');
  });

  it('leaves the positionals out of the option table', async () => {
    const usage = await renderUsage(TV, 'bun run tv');

    expect(usage).not.toContain('--target');
  });
});

describe('injectUsage', () => {
  it('replaces what stands between the markers and keeps the rest', () => {
    const readme = '# title\n\n<!-- usage:start -->\nstale\n<!-- usage:end -->\n\nrest\n';

    const written = injectUsage(readme, '| a | b |');

    expect(written).toBe(
      '# title\n\n<!-- usage:start -->\n\n| a | b |\n\n<!-- usage:end -->\n\nrest\n',
    );
  });

  it('refuses a file with no block to write into', () => {
    expect(() => injectUsage('# title\n', '| a | b |')).toThrow(/usage:start/);
  });
});
