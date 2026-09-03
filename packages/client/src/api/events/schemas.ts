import { z } from 'zod';
import { CastCommand, CastReceiver, CastState } from '../cast';
import { JobKey, JobRunId } from '../jobs';
import { ItemId, ShowId } from '../media';
import { ModuleId } from '../modules';
import { NotificationId } from '../notifications';
import { StageStat } from '../pipeline';
import { PlaybackSessionId } from '../playback';
import { ReportId } from '../reports';
import { RequestId } from '../requests';

const frame = <const T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.object({ type: z.literal(type), ...shape });

const counted = { count: z.number() };
const progress = { done: z.number(), total: z.number() };

/** Everything the core streams over `/api/events`.
 *
 * Module-emitted frames (`vpn.status`, `download.progress`, `module.op.*`) ride
 * the same socket but are NOT part of this union: core does not model module
 * events. A module declares its own frame types in its package and a listener
 * that wants them widens the socket:
 * `new KromaEvents<ServerEvent | TheirEvent>()`. */
export const ServerEvent = z.discriminatedUnion('type', [
  frame('hello', { version: z.string() }),
  frame('scan.started', {}),
  frame('scan.completed', { items: z.number(), shows: z.number(), libraries: z.number() }),
  frame('library.updated', {}),
  frame('item.updated', { id: ItemId }),
  frame('show.updated', { id: ShowId }),
  frame('enrich.progress', progress),
  frame('enrich.completed', { resolved: z.number(), total: z.number() }),
  frame('probe.progress', progress),
  frame('probe.completed', { total: z.number() }),
  frame('playback.started', counted),
  frame('playback.updated', counted),
  frame('playback.stopped', counted),
  frame('playback.terminate', { sessionId: PlaybackSessionId, message: z.string() }),
  frame('cast.receiver', { receiver: CastReceiver }),
  frame('cast.receiver.gone', { receiverId: z.string() }),
  frame('cast.kicked', { receiverId: z.string() }),
  frame('cast.position', {
    receiverId: z.string(),
    positionMs: z.number(),
    durationMs: z.number().optional(),
    state: CastState,
  }),
  frame('cast.command', { receiverId: z.string(), seq: z.number(), command: CastCommand }),
  frame('settings.updated', {}),
  frame('job.started', { key: JobKey, runId: JobRunId }),
  frame('job.progress', { key: JobKey, runId: JobRunId, ...progress }),
  frame('job.log', { runId: JobRunId, level: z.string(), message: z.string() }),
  frame('job.finished', { key: JobKey, runId: JobRunId, status: z.string() }),
  frame('pipeline.stats', { stages: z.array(StageStat) }),
  frame('request.updated', { id: RequestId, status: z.string() }),
  frame('report.updated', { id: ReportId, status: z.string() }),
  // Addressed: the server sends these only to sockets signed in as the
  // recipient, so receiving one always means "this is yours".
  frame('notification.created', { id: NotificationId, unread: z.number() }),
  frame('notification.read', { unread: z.number() }),
]);
export type ServerEvent = z.infer<typeof ServerEvent>;

/** The `module.op.*` frames the store operations stream over `/api/events`. Not
 * part of {@link ServerEvent} (module vocabulary stays out of core); a listener
 * widens the socket: `new KromaEvents<ServerEvent | StoreOpEvent>()`. */
export const StoreOpEvent = z.discriminatedUnion('type', [
  frame('module.op.started', {
    op: z.string(),
    kind: z.enum(['install', 'update', 'uninstall']),
    requested: z.string(),
    modules: z.array(
      z.object({
        id: ModuleId,
        name: z.string().nullish(),
        version: z.string().nullish(),
        size: z.number().nullish(),
      }),
    ),
  }),
  frame('module.op.progress', {
    op: z.string(),
    id: ModuleId,
    phase: z.enum(['download', 'install']),
    received: z.number().nullish(),
    total: z.number().nullish(),
  }),
  frame('module.op.done', { op: z.string(), id: ModuleId, version: z.string() }),
  frame('module.op.finished', { op: z.string(), ok: z.boolean(), error: z.string().nullish() }),
  frame('module.changed', { id: ModuleId, enabled: z.boolean().optional() }),
]);
export type StoreOpEvent = z.infer<typeof StoreOpEvent>;
