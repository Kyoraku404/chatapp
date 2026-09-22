import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHmac } from 'node:crypto';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/firebaseAdmin';

export async function GET() {
  const uid = await verifySession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!uid) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  const iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  const urls = process.env.TURN_URLS?.split(',').map(s => s.trim()).filter(Boolean);
  const secret = process.env.TURN_SECRET;
  if (urls?.length && secret) {
    const username = `${Math.floor(Date.now() / 1000) + 3600}:${uid}`;
    iceServers.push({ urls, username, credential: createHmac('sha1', secret).update(username).digest('base64') });
  }
  return NextResponse.json({ iceServers }, { headers: { 'Cache-Control': 'no-store' } });
}
