import type { StreamRefusal } from '@kromatv/core';

/** Why a stream will not play: a refusal from the server, or `broken`, an
 * engine that failed past every recovery it has. */
export type StreamFailure = StreamRefusal | 'broken';
