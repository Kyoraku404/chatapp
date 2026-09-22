export type CallStatus = 'ringing' | 'active' | 'ended' | 'declined';

export interface VoiceCallRecord {
  id: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  callerName: string;
  calleeName: string;
  status: CallStatus;
  offer: { type: 'offer'; sdp: string };
  answer: { type: 'answer'; sdp: string } | null;
  remoteCandidates: RTCIceCandidateInit[];
  createdAt: number;
  expiresAt: number;
  endedAt?: number;
}

export const CALL_RING_MS = 90_000;
export const CALL_ACTIVE_MS = 4 * 60 * 60 * 1000;

export function callIsLive(call: Pick<VoiceCallRecord, 'status' | 'expiresAt'> | null | undefined, now = Date.now()): boolean {
  return Boolean(call && (call.status === 'ringing' || call.status === 'active') && call.expiresAt > now);
}

export function isSdp(value: unknown, type: 'offer' | 'answer'): value is { type: typeof type; sdp: string } {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === type
    && typeof (value as { sdp?: unknown }).sdp === 'string'
    && (value as { sdp: string }).sdp.startsWith('v=0')
    && (value as { sdp: string }).sdp.length <= 60_000;
}

export function isIceCandidate(value: unknown): value is RTCIceCandidateInit {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return typeof c.candidate === 'string' && c.candidate.length <= 4096
    && (c.sdpMid == null || (typeof c.sdpMid === 'string' && c.sdpMid.length <= 128))
    && (c.sdpMLineIndex == null || (Number.isInteger(c.sdpMLineIndex) && Number(c.sdpMLineIndex) >= 0 && Number(c.sdpMLineIndex) < 50));
}
