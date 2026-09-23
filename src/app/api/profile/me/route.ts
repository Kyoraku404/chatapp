import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, verifySession, SESSION_COOKIE_NAME } from '@/lib/firebaseAdmin';
import { publicProfileFromDoc, validateProfileEdit } from '@/lib/profileModel';
import { r2Config, DeleteObjectCommand } from '@/lib/r2';

export const runtime = 'nodejs';
const response = (error: string, status: number) => NextResponse.json({ error }, { status });
const uploadUrl = (id: string) => `/api/attachments/media?id=${id}`;

async function sessionUid() {
  return verifySession(cookies().get(SESSION_COOKIE_NAME)?.value);
}

export async function GET() {
  const db = adminDb();
  if (!db) return response('Profile service unavailable.', 503);
  const uid = await sessionUid();
  if (!uid) return response('Unauthorized.', 401);
  const [user, settings] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`users/${uid}/private/profileSettings`).get(),
  ]);
  if (!user.exists) return response('Profile not found.', 404);
  return NextResponse.json({
    profile: publicProfileFromDoc(uid, user.data() ?? {}),
    privacy: {
      allowDMs: settings.data()?.allowDMs !== false,
      showMutualSpaces: settings.data()?.showMutualSpaces === true,
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(req: Request) {
  const db = adminDb();
  if (!db) return response('Profile service unavailable.', 503);
  const uid = await sessionUid();
  if (!uid) return response('Unauthorized.', 401);
  const raw = await req.json().catch(() => null);
  const parsed = validateProfileEdit(raw);
  if (!parsed.ok) return response(parsed.error, 400);
  const edit = parsed.value;
  const changesMedia = Boolean(edit.avatarUploadId || edit.bannerUploadId || edit.removeAvatar || edit.removeBanner);
  const r2 = changesMedia ? r2Config() : null;
  if (changesMedia && !r2) return response('Profile media is unavailable.', 503);
  const userRef = db.doc(`users/${uid}`);
  const settingsRef = db.doc(`users/${uid}/private/profileSettings`);
  let oldMedia: string[] = [];
  try {
    oldMedia = await db.runTransaction(async tx => {
      const user = await tx.get(userRef);
      if (!user.exists) throw new Error('NOT_FOUND');
      const current = user.data() ?? {};
      const oldName = String(current.usernameLower ?? current.username ?? '');
      const nameChanged = oldName !== edit.username;
      const newNameRef = db.doc(`usernames/${edit.username}`);
      const oldNameRef = oldName && nameChanged ? db.doc(`usernames/${oldName}`) : null;
      const avatarRef = edit.avatarUploadId ? db.doc(`r2Uploads/${edit.avatarUploadId}`) : null;
      const bannerRef = edit.bannerUploadId ? db.doc(`r2Uploads/${edit.bannerUploadId}`) : null;
      const [newName, oldNameSnap, avatar, banner] = await Promise.all([
        tx.get(newNameRef),
        oldNameRef ? tx.get(oldNameRef) : Promise.resolve(null),
        avatarRef ? tx.get(avatarRef) : Promise.resolve(null),
        bannerRef ? tx.get(bannerRef) : Promise.resolve(null),
      ]);
      if (newName.exists && newName.data()?.uid !== uid) throw new Error('USERNAME_TAKEN');
      const validUpload = (snap: typeof avatar | typeof banner, kind: 'avatar' | 'banner', id?: string) => {
        if (!id) return null;
        const data = snap?.data();
        if (!data || data.used || data.deleting || data.ownerId !== uid || data.scope !== kind || data.scopeId !== uid || data.storagePath !== `avatars/${uid}/${id}`) throw new Error('INVALID_UPLOAD');
        return data.storagePath as string;
      };
      const avatarPath = validUpload(avatar, 'avatar', edit.avatarUploadId);
      const bannerPath = validUpload(banner, 'banner', edit.bannerUploadId);
      const previous: string[] = [];
      if ((avatarPath || edit.removeAvatar) && typeof current.avatarPath === 'string') previous.push(current.avatarPath);
      if ((bannerPath || edit.removeBanner) && typeof current.bannerPath === 'string') previous.push(current.bannerPath);
      const userUpdate: Record<string, unknown> = {
        username: edit.username,
        usernameLower: edit.username,
        displayName: edit.displayName,
        bio: edit.bio,
        status: edit.status,
        profileAccent: edit.profileAccent,
        links: edit.links,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (!current.createdAt) userUpdate.createdAt = FieldValue.serverTimestamp();
      if (avatarPath || edit.removeAvatar) {
        userUpdate.avatarPath = avatarPath;
        userUpdate.avatarUrl = avatarPath ? uploadUrl(edit.avatarUploadId!) : null;
      }
      if (bannerPath || edit.removeBanner) {
        userUpdate.bannerPath = bannerPath;
        userUpdate.bannerUrl = bannerPath ? uploadUrl(edit.bannerUploadId!) : null;
      }
      tx.update(userRef, userUpdate);
      tx.set(settingsRef, { allowDMs: edit.allowDMs, showMutualSpaces: edit.showMutualSpaces, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (!newName.exists) tx.set(newNameRef, { uid, createdAt: FieldValue.serverTimestamp() });
      if (oldNameRef && oldNameSnap?.data()?.uid === uid) tx.delete(oldNameRef);
      if (avatarRef) tx.update(avatarRef, { used: true });
      if (bannerRef) tx.update(bannerRef, { used: true });
      return previous;
    });
  } catch (e) {
    const code = e instanceof Error ? e.message : '';
    if (code === 'USERNAME_TAKEN') return response('That username is taken.', 409);
    if (code === 'INVALID_UPLOAD') return response('Upload expired or does not belong to you. Choose the image again.', 409);
    if (code === 'NOT_FOUND') return response('Profile not found.', 404);
    return response('Could not save profile.', 500);
  }
  if (r2) for (const path of oldMedia) {
    if (!path.startsWith(`avatars/${uid}/`) && !path.startsWith(`attachments/avatar/${uid}/`) && !path.startsWith(`attachments/banner/${uid}/`)) continue;
    try {
      await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: path }));
      await db.doc(`r2Uploads/${path.split('/').at(-1)}`).delete();
    } catch { /* Keep metadata if R2 cleanup fails so the object can be reclaimed later. */ }
  }
  const [saved, settings] = await Promise.all([userRef.get(), settingsRef.get()]);
  return NextResponse.json({ ok: true, profile: publicProfileFromDoc(uid, saved.data() ?? {}), privacy: { allowDMs: settings.data()?.allowDMs !== false, showMutualSpaces: settings.data()?.showMutualSpaces === true } });
}
