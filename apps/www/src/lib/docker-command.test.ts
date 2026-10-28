import { describe, expect, it } from 'vitest';
import { dockerCommand } from './docker-command';

describe('dockerCommand', () => {
  it.each(['ghcr.io/kromatv/kroma:latest', 'ghcr.io/kromatv/kroma:0.1.40'])(
    'uses %s while preserving data and exposing the media mount',
    (image) => {
      const command = dockerCommand(image);
      const argumentsOnOneLine = command.replaceAll(' \\\n', ' ');
      expect(argumentsOnOneLine).toContain('--restart unless-stopped');
      expect(argumentsOnOneLine).toContain('-p 4040:4040');
      expect(argumentsOnOneLine).toContain('-e KROMA_MEDIA_DIRS=/media');
      expect(argumentsOnOneLine).toContain('-v kroma-data:/data');
      expect(argumentsOnOneLine).toContain('-v /path/to/media:/media');
      expect(argumentsOnOneLine.endsWith(image)).toBe(true);
      expect(
        command
          .split('\n')
          .slice(0, -1)
          .every((line) => line.endsWith('\\')),
      ).toBe(true);
    },
  );
});
