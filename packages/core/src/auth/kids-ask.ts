const asking = new Set<string>();

/** Remembers that the admin `adminId` asked a picker for a new Kids profile, so
 *  the members page opens the form once that admin is in (ACCT-135). */
export function askForKidsProfile(adminId: string): void {
  asking.clear();
  asking.add(adminId);
}

/** Whether `userId` asked for the Kids profile form and has not had it yet. */
export function kidsProfileAsked(userId: string): boolean {
  return asking.has(userId);
}

/** {@link kidsProfileAsked}, forgetting the ask when it was `userId`'s. */
export function takeKidsProfileAsk(userId: string): boolean {
  return asking.delete(userId);
}

/** Forgets an ask the admin walked away from. */
export function dropKidsProfileAsk(): void {
  asking.clear();
}
