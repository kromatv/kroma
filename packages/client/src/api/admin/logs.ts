import { z } from 'zod';

/** One line of the server's in-memory log ring (`GET /api/admin/logs`). */
export const LogEntry = z.object({
  seq: z.number(),
  ts: z.number(),
  level: z.string(),
  target: z.string(),
  source: z.string(),
  message: z.string(),
});
export type LogEntry = z.infer<typeof LogEntry>;

/** `GET /api/admin/logs` recent lines (newest last) + the sources present. */
export const LogsView = z.object({
  entries: z.array(LogEntry),
  sources: z.array(z.string()),
});
export type LogsView = z.infer<typeof LogsView>;
