import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { adminDb, verifySession, SESSION_COOKIE_NAME } from '@/lib/firebaseAdmin';
import { isValidUsername } from '@/lib/usernames';
import { publicProfileFromDoc } from '@/lib/profileModel';
import { profileBlocked } from '@/lib/profilePrivacy';

export async function GET(req: Request) {
  const db = adminDb();
  if (!db) return NextResponse.json({ error: 'Profile service unavailable.' }, { status: 503 });
  const viewerId = await verifySession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!viewerId) return NextResponse.json({ error: 'Sign in to view profiles.' }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const username = (params.get('username') ?? '').trim().toLowerCase();
  const targetUid = params.get('uid') ?? '';
  if (!isValidUsername(username) && !/^[A-Za-z0-9_-]{1,128}$/.test(targetUid)) return NextResponse.json({ error: 'Invalid profile.' }, { status: 400 });
  try {
    const uid = targetUid || (await db.doc(`usernames/${username}`).get()).data()?.uid as string | undefined;
    if (!uid) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
    const [snap, blocked] = await Promise.all([db.doc(`users/${uid}`).get(), profileBlocked(db, viewerId, uid)]);
    if (!snap.exists || blocked) return NextResponse.json({ error: 'Profile not available.' }, { status: 404 });
    const profile = publicProfileFromDoc(uid, snap.data() ?? {});
    if (username && profile.username !== username) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
    const privacy = (await db.doc(`users/${uid}/private/profileSettings`).get()).data();
    const mutualSpaces: { id: string; name: string }[] = [];
    const mutualGroups: { id: string; name: string }[] = [];
    if (uid !== viewerId && privacy?.showMutualSpaces === true) {
      const [viewerMemberships, targetMemberships, viewerGroups] = await Promise.all([
        db.collectionGroup('members').where('userId', '==', viewerId).orderBy('joinedAt', 'desc').limit(50).get(),
        db.collectionGroup('members').where('userId', '==', uid).orderBy('joinedAt', 'desc').limit(50).get(),
        db.collection('groups').where('memberIds', 'array-contains', viewerId).limit(50).get(),
      ]).catch(() => [null, null, null] as const);
      const viewerSpaceIds = new Set(viewerMemberships?.docs.map(d => d.ref.parent.parent?.id).filter(Boolean));
      const sharedIds = [...new Set(targetMemberships?.docs.map(d => d.ref.parent.parent?.id).filter((id): id is string => Boolean(id && viewerSpaceIds.has(id))) ?? [])].slice(0, 8);
      const spaces = await Promise.all(sharedIds.map(id => db.doc(`spaces/${id}`).get()));
      for (const s of spaces) if (s.exists) mutualSpaces.push({ id: s.id, name: String(s.data()?.name ?? 'Space').slice(0, 80) });
      for (const group of viewerGroups?.docs ?? []) {
        if ((group.data().memberIds as string[] | undefined)?.includes(uid)) mutualGroups.push({ id: group.id, name: String(group.data().name ?? 'Group').slice(0, 80) });
        if (mutualGroups.length >= 8) break;
      }
    }
    return NextResponse.json({ profile, mutualSpaces, mutualGroups, canMessage: uid !== viewerId && privacy?.allowDMs !== false }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Could not load profile.' }, { status: 500 });
  }
}
