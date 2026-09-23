import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceCallRecord } from '@/lib/voiceCalls';

const mocks = vi.hoisted(() => ({ onSnapshot: vi.fn() }));
const tones = vi.hoisted(() => ({ ring: vi.fn(async () => true), stop: vi.fn(), unanswered: vi.fn(async () => {}), unlock: vi.fn(), close: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: (...parts: string[]) => parts.join('/'), onSnapshot: mocks.onSnapshot }));
vi.mock('@/lib/firebaseClient', () => ({ firebaseDb: () => ({}) }));
vi.mock('@/lib/callSounds', () => ({ CallSounds: class { ring = tones.ring; stop = tones.stop; unanswered = tones.unanswered; unlock = tones.unlock; close = tones.close; } }));
import { useVoiceCall } from './useVoiceCall';

let snapshot: (value: { exists: () => boolean; data: () => VoiceCallRecord }) => void;
let voice: ReturnType<typeof useVoiceCall>;
let tree: ReactTestRenderer;
let sent: Array<{ action: string; [key: string]: unknown }>;
let tracks: Array<{ kind: 'audio' | 'video'; enabled: boolean; stop: ReturnType<typeof vi.fn> }>;
let peers: FakePeer[];
let emitEarlyCandidate: boolean;
const call: VoiceCallRecord = {
  id:'call-123456', conversationId:'dm_a_b', callerId:'a', calleeId:'b', callerName:'Alice', calleeName:'Bob',
  status:'ringing', offer:{type:'offer',sdp:'v=0\r\n'}, answer:null, remoteCandidates:[], createdAt:100, expiresAt:Date.now()+300_000,
};
class FakePeer {
  connectionState = 'new';
  remoteDescription: RTCSessionDescriptionInit | null = null;
  localDescription: RTCSessionDescriptionInit | null = null;
  onicecandidate: ((event: { candidate: { toJSON: () => RTCIceCandidateInit } | null }) => void) | null = null;
  ontrack: unknown = null;
  onconnectionstatechange: (() => void) | null = null;
  added: RTCIceCandidateInit[] = [];
  close = vi.fn();
  constructor() { peers.push(this); }
  addedTracks: Array<{ kind: 'audio' | 'video' }> = [];
  transceivers: Array<{ kind: string; direction: string }> = [];
  addTrack(track: { kind: 'audio' | 'video' }) { this.addedTracks.push(track); return {}; }
  addTransceiver(kind: string, options: { direction: string }) { this.transceivers.push({ kind, direction: options.direction }); return {}; }
  async createOffer() { return {type:'offer',sdp:'v=0\r\n'} as RTCSessionDescriptionInit; }
  async createAnswer() { return {type:'answer',sdp:'v=0\r\n'} as RTCSessionDescriptionInit; }
  async setLocalDescription(v: RTCSessionDescriptionInit) {
    this.localDescription=v;
    if (emitEarlyCandidate && v.type === 'offer') this.onicecandidate?.({candidate:{toJSON:()=>({candidate:'candidate:early',sdpMid:'0',sdpMLineIndex:0})}});
  }
  async setRemoteDescription(v: RTCSessionDescriptionInit) { this.remoteDescription=v; }
  async addIceCandidate(v: RTCIceCandidateInit) { this.added.push(v); }
}
function Harness({ uid }: { uid: string }) { voice = useVoiceCall(uid); return null; }
beforeEach(async () => {
  sent=[]; peers=[]; tracks=[]; emitEarlyCandidate=false;
  Object.values(tones).forEach(mock => mock.mockClear());
  mocks.onSnapshot.mockImplementation((_ref, cb) => {snapshot=cb;return () => {};});
  vi.stubGlobal('RTCPeerConnection', FakePeer);
  vi.stubGlobal('MediaStream', class { tracks: unknown[]; constructor(tracks: unknown[] = []) { this.tracks = tracks; } addTrack(track: unknown) { this.tracks.push(track); } });
  vi.stubGlobal('window', { RTCPeerConnection: FakePeer, addEventListener: vi.fn(), removeEventListener: vi.fn(), setInterval, clearInterval });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async (constraints: MediaStreamConstraints) => {
    const ownTracks: typeof tracks = [];
    if (constraints.audio) ownTracks.push({kind:'audio',enabled:true,stop:vi.fn()});
    if (constraints.video) ownTracks.push({kind:'video',enabled:true,stop:vi.fn()});
    tracks.push(...ownTracks);
    return {
      getTracks:()=>ownTracks,
      getAudioTracks:()=>ownTracks.filter(track=>track.kind==='audio'),
      getVideoTracks:()=>ownTracks.filter(track=>track.kind==='video'),
      addTrack:(track: typeof tracks[number])=>ownTracks.push(track),
    };
  }) } });
  vi.stubGlobal('fetch', vi.fn(async (url:string, options?:{body?:string}) => {
    if (url.endsWith('/ice')) return {ok:true,json:async()=>({iceServers:[]})};
    const body=JSON.parse(options?.body ?? '{}'); sent.push(body);
    return {ok:true,json:async()=>({ok:true,callId:'call-123456'})};
  }));
});
afterEach(() => { act(()=>tree?.unmount()); vi.unstubAllGlobals(); });
describe('WebRTC call lifecycle', () => {
  it('creates an offer, applies an answer and remote candidates, mutes, and releases mic on hangup', async () => {
    await act(async()=>{tree=create(createElement(Harness,{uid:'a'}));});
    await act(async()=>{await voice.start('dm_a_b','b');});
    expect(peers[0].localDescription?.type).toBe('offer');
    expect(sent.some(x=>x.action==='start')).toBe(true);
    await act(async()=>snapshot({exists:()=>true,data:()=>({...call,status:'active',answer:{type:'answer',sdp:'v=0\r\n'},remoteCandidates:[{candidate:'candidate:1',sdpMid:'0',sdpMLineIndex:0}]})}));
    expect(peers[0].remoteDescription?.type).toBe('answer');
    expect(peers[0].added).toHaveLength(1);
    act(()=>voice.toggleMute());
    expect(tracks[0].enabled).toBe(false);
    await act(async()=>{await voice.end();});
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(peers[0].close).toHaveBeenCalled();
    expect(sent.some(x=>x.action==='end')).toBe(true);
  });
  it('sends ICE candidates gathered before the caller receives the call document', async () => {
    emitEarlyCandidate=true;
    await act(async()=>{tree=create(createElement(Harness,{uid:'a'}));});
    await act(async()=>{await voice.start('dm_a_b','b');});
    expect(sent.some(x=>x.action==='candidate' && x.conversationId==='dm_a_b' && x.otherUid==='b')).toBe(true);
  });
  it('attaches the remote audio track and retries playback when mobile audio becomes available', async () => {
    await act(async()=>{tree=create(createElement(Harness,{uid:'a'}));});
    await act(async()=>{await voice.start('dm_a_b','b');});
    const audio = {srcObject:null as unknown, muted:true, volume:0, play:vi.fn(async()=>{})};
    (voice.audioRef as {current: unknown}).current=audio;
    const track = {kind:'audio', onmute:null, onunmute:null as (()=>void)|null};
    await act(async()=>{(peers[0].ontrack as (event: {track: typeof track})=>void)({track});});
    expect(audio.srcObject).toBeTruthy();
    expect(audio.muted).toBe(false);
    expect(audio.volume).toBe(1);
    expect(audio.play).toHaveBeenCalledTimes(1);
    await act(async()=>{track.onunmute?.();});
    expect(audio.play).toHaveBeenCalledTimes(2);
  });
  it('uses the incoming offer to answer and releases mic on remote hangup', async () => {
    await act(async()=>{tree=create(createElement(Harness,{uid:'b'}));});
    await act(async()=>snapshot({exists:()=>true,data:()=>call}));
    await act(async()=>{await voice.accept();});
    expect(peers[0].remoteDescription?.type).toBe('offer');
    expect(peers[0].localDescription?.type).toBe('answer');
    expect(sent.some(x=>x.action==='answer')).toBe(true);
    await act(async()=>snapshot({exists:()=>true,data:()=>({...call,status:'ended'})}));
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(voice.call).toBeNull();
  });
  it('offers a video call with camera and microphone, toggles the camera, and releases both tracks', async () => {
    await act(async()=>{tree=create(createElement(Harness,{uid:'a'}));});
    await act(async()=>{await voice.start('dm_a_b','b','video');});
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({video:false,audio:expect.any(Object)}));
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({video:expect.any(Object),audio:false}));
    expect(peers[0].addedTracks.map(track=>track.kind)).toEqual(['audio','video']);
    expect(sent.find(x=>x.action==='start')?.media).toBe('video');
    act(()=>voice.toggleCamera());
    expect(tracks[1].enabled).toBe(false);
    expect(voice.cameraOff).toBe(true);
    await act(async()=>{await voice.end();});
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(tracks[1].stop).toHaveBeenCalled();
  });
  it('answers an incoming video call with both media tracks', async () => {
    await act(async()=>{tree=create(createElement(Harness,{uid:'b'}));});
    await act(async()=>snapshot({exists:()=>true,data:()=>({...call,media:'video'})}));
    await act(async()=>{await voice.accept();});
    expect(peers[0].addedTracks.map(track=>track.kind)).toEqual(['audio','video']);
    expect(sent.some(x=>x.action==='answer')).toBe(true);
  });
  it('starts a video call without a camera and still offers to receive the other side’s video', async () => {
    await act(async()=>{tree=create(createElement(Harness,{uid:'a'}));});
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReset();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementationOnce(async () => {
      const audio={kind:'audio' as const,enabled:true,stop:vi.fn()}; tracks.push(audio);
      return {getTracks:()=>[audio],getAudioTracks:()=>[audio],getVideoTracks:()=>[],addTrack:vi.fn()} as unknown as MediaStream;
    }).mockRejectedValueOnce(new DOMException('No camera', 'NotFoundError'));
    await act(async()=>{await voice.start('dm_a_b','b','video');});
    expect(voice.error).toBeNull();
    expect(voice.hasLocalCamera).toBe(false);
    expect(peers[0].addedTracks.map(track=>track.kind)).toEqual(['audio']);
    expect(peers[0].transceivers).toEqual([{kind:'video',direction:'recvonly'}]);
    expect(sent.find(x=>x.action==='start')?.media).toBe('video');
    await act(async()=>{await voice.end();});
    expect(tracks[0].stop).toHaveBeenCalled();
  });
  it('answers a video call without a camera, leaving voice available', async () => {
    await act(async()=>{tree=create(createElement(Harness,{uid:'b'}));});
    await act(async()=>snapshot({exists:()=>true,data:()=>({...call,media:'video'})}));
    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementationOnce(async () => {
      const audio={kind:'audio' as const,enabled:true,stop:vi.fn()}; tracks.push(audio);
      return {getTracks:()=>[audio],getAudioTracks:()=>[audio],getVideoTracks:()=>[],addTrack:vi.fn()} as unknown as MediaStream;
    }).mockRejectedValueOnce(new DOMException('Camera denied', 'NotAllowedError'));
    await act(async()=>{await voice.accept();});
    expect(voice.error).toBeNull();
    expect(peers[0].addedTracks.map(track=>track.kind)).toEqual(['audio']);
    expect(peers[0].transceivers).toEqual([{kind:'video',direction:'recvonly'}]);
    expect(sent.some(x=>x.action==='answer')).toBe(true);
  });
  it('plays remote video with its audio track and allows a mobile playback retry', async () => {
    await act(async()=>{tree=create(createElement(Harness,{uid:'a'}));});
    await act(async()=>{await voice.start('dm_a_b','b','video');});
    const video = {srcObject:null as unknown, muted:true, volume:0, play:vi.fn(async()=>{})};
    (voice.remoteVideoRef as {current: unknown}).current=video;
    const videoTrack = {kind:'video', onmute:null, onunmute:null as (()=>void)|null};
    const audioTrack = {kind:'audio', onmute:null, onunmute:null as (()=>void)|null};
    await act(async()=>{
      (peers[0].ontrack as (event: {track: typeof videoTrack})=>void)({track:videoTrack});
      (peers[0].ontrack as (event: {track: typeof audioTrack})=>void)({track:audioTrack});
    });
    expect(video.srcObject).toBeTruthy();
    expect(video.muted).toBe(false);
    expect((video.srcObject as {tracks: unknown[]}).tracks).toEqual([videoTrack,audioTrack]);
    await act(async()=>voice.playAudio());
    expect(video.play).toHaveBeenCalledTimes(3);
  });
  it('rings an incoming call and stops the ringtone when answered', async () => {
    await act(async()=>{tree=create(createElement(Harness,{uid:'b'}));});
    await act(async()=>snapshot({exists:()=>true,data:()=>call}));
    expect(tones.ring).toHaveBeenCalledWith('incoming');
    await act(async()=>{await voice.accept();});
    expect(tones.stop).toHaveBeenCalled();
  });
  it('plays three-note no-answer cue only after the caller’s ringing window expires', async () => {
    await act(async()=>{tree=create(createElement(Harness,{uid:'a'}));});
    await act(async()=>snapshot({exists:()=>true,data:()=>call}));
    expect(tones.ring).toHaveBeenCalledWith('outgoing');
    await act(async()=>snapshot({exists:()=>true,data:()=>({...call,expiresAt:Date.now()-1})}));
    expect(tones.unanswered).toHaveBeenCalledTimes(1);
    expect(voice.error).toMatch(/No answer/);
  });
  it('explains a denied mic and lets the user retry permission without starting a call', async () => {
    await act(async()=>{tree=create(createElement(Harness,{uid:'a'}));});
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    await act(async()=>{await voice.checkMicrophone();});
    expect(voice.error).toMatch(/site settings/);
    await act(async()=>{await voice.checkMicrophone();});
    expect(voice.micNotice).toMatch(/Microphone is ready/);
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });
});
