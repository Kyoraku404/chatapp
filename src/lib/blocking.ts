// Blocking semantics (pure, unit-tested).
// A blocked user cannot initiate DMs to the blocker and sees no presence.
// Block lists are private: never expose who blocked whom to third parties.
//
// Storage convention (enforced by firestore.rules): block docs use
// deterministic ids `{blockerId}_{blockedId}` so message rules can check
// both directions without a query. Firebase Auth UIDs are alphanumeric
// (no underscores), so `parseBlockDocId` splitting on the first `_` is safe.

/** Can `senderId` open/write a DM with `otherId` given the block edges? */
export function canDirectMessage(
  senderId: string,
  otherId: string,
  blocks: Array<{ blockerId: string; blockedId: string }>,
): boolean {
  if (senderId === otherId) return false;
  for (const b of blocks) {
    // Either direction blocks initiating new direct contact:
    // - if the recipient blocked the sender -> no DM
    // - if the sender blocked the recipient -> sender must unblock first
    if (
      (b.blockerId === otherId && b.blockedId === senderId) ||
      (b.blockerId === senderId && b.blockedId === otherId)
    )
      return false;
  }
  return true;
}

/** Deterministic block doc id. Must match the firestore.rules convention. */
export function blockDocId(blockerId: string, blockedId: string): string {
  if (!blockerId || !blockedId) throw new Error("blockDocId requires two ids");
  if (blockerId === blockedId) throw new Error("Cannot block yourself");
  return `${blockerId}_${blockedId}`;
}

/** Inverse of blockDocId; null for malformed ids. */
export function parseBlockDocId(
  docId: string,
): { blockerId: string; blockedId: string } | null {
  const i = docId.indexOf("_");
  if (i <= 0 || i === docId.length - 1) return null;
  return { blockerId: docId.slice(0, i), blockedId: docId.slice(i + 1) };
}
