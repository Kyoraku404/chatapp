// Deterministic DM conversation IDs (pure, unit-tested).
// dm_<a>_<b> where a,b are the two uids sorted lexicographically.
// Repeatedly starting a chat with the same person resolves to the same ID,
// so duplicate conversations cannot be created by retry/double-click.

export function dmConversationId(uidA: string, uidB: string): string {
  if (!uidA || !uidB) throw new Error("dmConversationId requires two uids");
  if (uidA === uidB) throw new Error("Cannot create a DM with yourself");
  const [a, b] = [uidA, uidB].sort();
  return `dm_${a}_${b}`;
}

export function dmParticipants(conversationId: string): [string, string] | null {
  const m = /^dm_(.+?)_(.+)$/.exec(conversationId);
  if (!m) return null;
  return [m[1], m[2]];
}

export type DmBackfillAction =
  | { action: "none" }
  | { action: "publish"; needsTimestamp: boolean }
  | { action: "reset-to-pending" };

/**
 * Pure migration decision for DM docs that predate (or bypassed) the
 * hasMessages visibility gate.
 *
 * The discovery listener only matches hasMessages == true, so any doc with
 * real messages but hasMessages !== true is invisible to BOTH participants
 * until fixed. hasMessage = "does the messages subcollection contain ≥1 doc"
 * (determined server-side with a limit(1) read, never guessed from metadata).
 *
 * - hasMessages === true            → none (already discoverable)
 * - hasMessage === true             → publish (flip visible; stamp
 *   lastMessageAt only when it is currently null so real activity order
 *   is never rewritten)
 * - hasMessage === false, metadata claims a preview/sender (or a
 *   timestamp) but no message exists → reset-to-pending (stay hidden
 *   until the first real message; never fabricate a preview)
 * - otherwise (clean pending/empty) → none
 */
export function classifyDmDoc(
  data: { hasMessages?: unknown; lastMessagePreview?: unknown; lastMessageSenderId?: unknown; lastMessageAt?: unknown },
  hasMessage: boolean,
): DmBackfillAction {
  if (data.hasMessages === true) return { action: "none" };
  if (hasMessage) return { action: "publish", needsTimestamp: data.lastMessageAt == null };
  const hasPreview =
    typeof data.lastMessagePreview === "string" && data.lastMessagePreview.length > 0;
  const hasSender =
    typeof data.lastMessageSenderId === "string" && data.lastMessageSenderId.length > 0;
  if (hasPreview || hasSender || data.lastMessageAt != null)
    return { action: "reset-to-pending" };
  return { action: "none" };
}
