import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, verifySession, SESSION_COOKIE_NAME } from '@/lib/firebaseAdmin';

/** Recipient acknowledgement only; existing message rules keep these fields server-owned. */
export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return NextResponse.json({ error: 'Not configured.' }, { status: 503 });
  const uid = await verifySession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!uid) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const validId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(v);
  if (!validId(body.conversationId) || !Array.isArray(body.ids) || !body.ids.length || body.ids.length > 25 || !body.ids.every(validId) || !['delivered', 'read'].includes(body.state))
    return NextResponse.json({ error: 'Invalid acknowledgement.' }, { status: 400 });
  try {
    await db.runTransaction(async tx => {
      const parent = db.doc(`conversations/${body.conversationId}`);
      const conversation = await tx.get(parent);
      if (!conversation.data()?.participants?.includes(uid)) throw new Error('FORBIDDEN');
      const refs = [...new Set<string>(body.ids)].map(id => parent.collection('messages').doc(id));
      const messages = await tx.getAll(...refs);
      for (const m of messages) {
        if (!m.exists || m.data()?.senderId === uid) continue;
        const update: Record<string, unknown> = {};
        if (!m.data()?.deliveredAt) update.deliveredAt = FieldValue.serverTimestamp();
        if (body.state === 'read' && !m.data()?.readAt) update.readAt = FieldValue.serverTimestamp();
        if (Object.keys(update).length) tx.update(m.ref, update);
      }
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Acknowledgement failed.' }, { status: e instanceof Error && e.message === 'FORBIDDEN' ? 403 : 500 });
  }
}
