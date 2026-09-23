import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { adminDb, verifySession, SESSION_COOKIE_NAME } from '@/lib/firebaseAdmin';
import { dmConversationId } from '@/lib/dm';
import { blockDocId } from '@/lib/blocking';
import { CALL_ACTIVE_MS, CALL_RING_MS, callIsLive, isIceCandidate, isSdp, type CallMedia, type VoiceCallRecord } from '@/lib/voiceCalls';

type RequestBody = {
  action?: 'start' | 'answer' | 'end' | 'candidate';
  conversationId?: string;
  otherUid?: string;
  callId?: string;
  offer?: unknown;
  answer?: unknown;
  candidate?: unknown;
  media?: CallMedia;
};

const result = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return result('Calls are not configured.', 503);
  const uid = await verifySession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!uid) return result('Unauthorized.', 401);
  const body = await req.json().catch(() => ({})) as RequestBody;
  const { action, conversationId, otherUid, callId } = body;
  if (!['start', 'answer', 'end', 'candidate'].includes(action ?? '') || !conversationId || !otherUid || uid === otherUid) return result('Invalid call request.', 400);
  try {
    if (dmConversationId(uid, otherUid) !== conversationId) return result('Invalid participants.', 400);
  } catch { return result('Invalid participants.', 400); }
  if (action === 'start' && !isSdp(body.offer, 'offer')) return result('Invalid offer.', 400);
  if (action === 'start' && body.media !== undefined && body.media !== 'audio' && body.media !== 'video') return result('Invalid call type.', 400);
  if (action === 'answer' && !isSdp(body.answer, 'answer')) return result('Invalid answer.', 400);
  if (action === 'candidate' && !isIceCandidate(body.candidate)) return result('Invalid network candidate.', 400);
  if (action !== 'start' && (!callId || !/^[A-Za-z0-9_-]{8,100}$/.test(callId))) return result('Invalid call ID.', 400);
  const myRef = db.doc(`users/${uid}/private/voiceCall`);
  const otherRef = db.doc(`users/${otherUid}/private/voiceCall`);
  const conversationRef = db.doc(`conversations/${conversationId}`);
  const blockedA = db.doc(`blocks/${blockDocId(uid, otherUid)}`);
  const blockedB = db.doc(`blocks/${blockDocId(otherUid, uid)}`);
  const newId = action === 'start' ? db.collection('voiceCalls').doc().id : callId!;
  try {
    await db.runTransaction(async tx => {
      const [conversation, mine, other, block1, block2] = await Promise.all([
        tx.get(conversationRef), tx.get(myRef), tx.get(otherRef), tx.get(blockedA), tx.get(blockedB),
      ]);
      const participants = conversation.data()?.participants as string[] | undefined;
      if (!conversation.exists || !participants?.includes(uid) || !participants.includes(otherUid) || block1.exists || block2.exists) throw new Error('FORBIDDEN');
      const now = Date.now();
      const mineData = mine.data() as VoiceCallRecord | undefined;
      const otherData = other.data() as VoiceCallRecord | undefined;
      if (action === 'start') {
        if (callIsLive(mineData, now) || callIsLive(otherData, now)) throw new Error('BUSY');
        const [caller, callee] = await Promise.all([
          tx.get(db.doc(`users/${uid}`)), tx.get(db.doc(`users/${otherUid}`)),
        ]);
        const call: VoiceCallRecord = {
          id: newId, conversationId, callerId: uid, calleeId: otherUid,
          callerName: String(caller.data()?.displayName ?? 'Someone').slice(0, 80),
          calleeName: String(callee.data()?.displayName ?? 'Someone').slice(0, 80),
          status: 'ringing', media: body.media ?? 'audio', offer: body.offer as VoiceCallRecord['offer'], answer: null,
          remoteCandidates: [], createdAt: now, expiresAt: now + CALL_RING_MS,
        };
        tx.set(myRef, call);
        tx.set(otherRef, call);
        return;
      }
      if (!mineData || !otherData || mineData.id !== callId || otherData.id !== callId || mineData.conversationId !== conversationId || otherData.conversationId !== conversationId) throw new Error('STALE');
      if (action === 'answer') {
        if (uid !== mineData.calleeId || mineData.status !== 'ringing' || !callIsLive(mineData, now)) throw new Error('STALE');
        tx.update(myRef, { status: 'active', answer: body.answer, expiresAt: now + CALL_ACTIVE_MS });
        tx.update(otherRef, { status: 'active', answer: body.answer, expiresAt: now + CALL_ACTIVE_MS });
      } else if (action === 'end') {
        if (!callIsLive(mineData, now)) return;
        const status = uid === mineData.calleeId && mineData.status === 'ringing' ? 'declined' : 'ended';
        tx.update(myRef, { status, endedAt: now });
        tx.update(otherRef, { status, endedAt: now });
      } else {
        if (!callIsLive(mineData, now) || otherData.remoteCandidates.length >= 80) throw new Error('STALE');
        tx.update(otherRef, { remoteCandidates: [...otherData.remoteCandidates, body.candidate] });
      }
    });
    return NextResponse.json({ ok: true, callId: newId });
  } catch (e) {
    const code = e instanceof Error ? e.message : '';
    if (code === 'FORBIDDEN') return result('Cannot call this person.', 403);
    if (code === 'BUSY') return result('One of you is already in a call.', 409);
    if (code === 'STALE') return result('This call has ended.', 409);
    return result('Call could not be updated.', 500);
  }
}
