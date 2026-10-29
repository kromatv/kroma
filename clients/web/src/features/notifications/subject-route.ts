import type { Notification, NotificationSubject } from '@kromatv/client/notifications';

/**
 * Where this client opens each subject kind, by the kind alone. A kind absent
 * from here is a module's, and a `request` the reader did not file is too: where
 * a requested title ended up is a catalogue fact only the server has, so those
 * rows keep the `link` it computed.
 */
export const SUBJECT_ROUTES: Readonly<Record<string, (id: string) => string>> = {
  movie: (id) => `/movies/${id}`,
  episode: (id) => `/movies/${id}`,
  show: (id) => `/shows/${id}`,
  report: () => '/admin/reports',
  job: () => '/admin/jobs',
};

/** The route a notification's subject opens, or `undefined` when this client
 * has no screen of its own for it and the row's `link` should win. */
export function subjectRoute(
  subject: NotificationSubject,
  event: Notification['event'],
): string | undefined {
  if (subject.kind === 'request') {
    return event === 'request.submitted' ? `/admin/requests/${subject.id}` : undefined;
  }
  return SUBJECT_ROUTES[subject.kind]?.(subject.id);
}
