import type { Firestore } from "firebase-admin/firestore";

export type AttachmentScope = "dm" | "group" | "space" | "avatar";

export async function canAccessAttachment(db: Firestore, uid: string, scope: AttachmentScope, scopeId: string) {
  if (!/^[A-Za-z0-9_-]{1,180}$/.test(scopeId)) return false;
  if (scope === "avatar") return true;
  if (scope === "dm") {
    const snap = await db.doc(`conversations/${scopeId}`).get();
    return snap.exists && snap.data()?.kind === "dm" && (snap.data()?.participants as string[] | undefined)?.includes(uid) === true;
  }
  if (scope === "group") {
    const snap = await db.doc(`groups/${scopeId}`).get();
    return snap.exists && (snap.data()?.memberIds as string[] | undefined)?.includes(uid) === true;
  }
  const [space, member] = await Promise.all([
    db.doc(`spaces/${scopeId}`).get(),
    db.doc(`spaces/${scopeId}/members/${uid}`).get(),
  ]);
  return space.exists && (space.data()?.ownerId === uid || member.exists);
}

export function attachmentId(path: string) {
  return /^[a-f0-9-]{36}$/.test(path.split("/").at(-1) ?? "") ? path.split("/").at(-1)! : null;
}
