import type { Firestore } from 'firebase-admin/firestore';
import { blockDocId } from './blocking';

export async function profileBlocked(db: Firestore, viewerId: string, ownerId: string): Promise<boolean> {
  if (viewerId === ownerId) return false;
  const [a, b] = await Promise.all([
    db.doc(`blocks/${blockDocId(viewerId, ownerId)}`).get(),
    db.doc(`blocks/${blockDocId(ownerId, viewerId)}`).get(),
  ]);
  return a.exists || b.exists;
}

export async function canReceiveDm(db: Firestore, ownerId: string): Promise<boolean> {
  const settings = await db.doc(`users/${ownerId}/private/profileSettings`).get();
  return settings.data()?.allowDMs !== false;
}
