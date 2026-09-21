// Auth + membership authorization helpers that run on the server
// (API routes / server components). Pure and unit-tested; they take the
// already-verified uid — never trust a userId supplied by the browser.

/** Can uid read a DM conversation? Must be a participant. */
export function canReadDM(uid: string, participants: string[]): boolean {
  return participants.includes(uid);
}

/** Can uid write to a DM conversation? Participant + not blocked. */
export function canWriteDM(
  uid: string,
  participants: string[],
  blocked: boolean,
): boolean {
  if (!participants.includes(uid)) return false;
  return !blocked;
}

/** Can uid read a group? Must be a member. */
export function canReadGroup(uid: string, memberIds: string[]): boolean {
  return memberIds.includes(uid);
}

/** Can uid read a space channel? Must hold a membership. */
export function canReadChannel(uid: string, memberUserIds: string[]): boolean {
  return memberUserIds.includes(uid);
}

/** Join must be idempotent: existing membership => no-op, never duplicate. */
export function shouldCreateMembership(existingRole: string | null): boolean {
  return existingRole == null;
}
