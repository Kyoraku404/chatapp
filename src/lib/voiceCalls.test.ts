import { describe, expect, it } from 'vitest';
import { CALL_RING_MS, callIsLive, isIceCandidate, isSdp } from './voiceCalls';

describe('voice call validation', () => {
  it('expires unanswered calls and prevents ended calls from blocking new ones', () => {
    expect(callIsLive({status:'ringing',expiresAt:100+CALL_RING_MS},100)).toBe(true);
    expect(callIsLive({status:'ringing',expiresAt:100+CALL_RING_MS},100+CALL_RING_MS)).toBe(false);
    expect(callIsLive({status:'ended',expiresAt:99999},100)).toBe(false);
  });
  it('accepts small SDP descriptions of the requested type', () => {
    expect(isSdp({type:'offer',sdp:'v=0\r\n'},'offer')).toBe(true);
    expect(isSdp({type:'answer',sdp:'v=0\r\n'},'answer')).toBe(true);
    expect(isSdp({type:'answer',sdp:'v=0\r\n'},'offer')).toBe(false);
    expect(isSdp({type:'offer',sdp:'x'.repeat(60_001)},'offer')).toBe(false);
  });
  it('limits candidate shape and payload size', () => {
    expect(isIceCandidate({candidate:'candidate:1',sdpMid:'0',sdpMLineIndex:0})).toBe(true);
    expect(isIceCandidate({candidate:'x'.repeat(4097)})).toBe(false);
    expect(isIceCandidate({candidate:'ok',sdpMLineIndex:-1})).toBe(false);
    expect(isIceCandidate({candidate:'ok',sdpMid:{evil:true}})).toBe(false);
  });
});
