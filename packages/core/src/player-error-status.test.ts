import { describe, expect, it } from 'vitest';
import { playerErrorStatus } from './player-error-status';

describe('playerErrorStatus', () => {
  it('reads the status Media3 was refused with', () => {
    const error = { message: 'A playback exception has occurred: Source error Response code: 404' };

    expect(playerErrorStatus(error)).toBe(404);
  });

  it('answers null for a failure that names no status', () => {
    const error = { message: 'The player failed: PLAYER_ERROR_CONNECTION_FAILED' };

    expect(playerErrorStatus(error)).toBeNull();
  });

  it('answers null for an error that carries no message', () => {
    expect(playerErrorStatus({ code: 404 })).toBeNull();
  });
});
