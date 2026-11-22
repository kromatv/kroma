/** The address a person opens to redeem an invitation: the one the server made
 * for it, else the join page on `origin`. */
export function invitationLink(
  invite: { url: string | null; token: string },
  origin: string = globalThis.location?.origin ?? '',
): string {
  return invite.url ?? `${origin}/join?invite=${invite.token}`;
}
