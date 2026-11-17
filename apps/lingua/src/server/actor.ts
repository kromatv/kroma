import type { User } from '#site/store/store';

/** Who a write is for and when it was asked: the signed-in contributor, and the request's time in seconds. */
export interface Actor {
  user: User;
  now: number;
}
