"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { firebaseDb } from '@/lib/firebaseClient';
import { callIsLive, type CallMedia, type VoiceCallRecord } from '@/lib/voiceCalls';
import { CallSounds } from '@/lib/callSounds';
import { microphoneError } from '@/lib/microphone';

type CallAction = 'start' | 'answer' | 'end' | 'candidate';
async function signal(action: CallAction, body: Record<string, unknown>): Promise<{ callId: string }> {
  const response = await fetch('/api/dm/calls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
  const data = await response.json().catch(() => ({})) as { callId?: string; error?: string };
  if (!response.ok || !data.callId) throw new Error(data.error || 'Call could not connect.');
  return { callId: data.callId };
}

async function iceServers(): Promise<RTCIceServer[]> {
  const response = await fetch('/api/dm/calls/ice', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not prepare the call.');
  const data = await response.json() as { iceServers: RTCIceServer[] };
  return data.iceServers;
}

async function captureMedia(media: CallMedia): Promise<MediaStream> {
  if (window.isSecureContext === false) throw new Error(microphoneError(undefined, false, false));
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot request microphone access. Open RUSH directly in a current browser over HTTPS.');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
  } catch (e) {
    let embedded = false;
    try { embedded = window.self !== window.top; } catch { embedded = true; }
    throw new Error(microphoneError(e, true, embedded));
  }
  if (media === 'video') {
    try {
      const camera = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } });
      camera.getVideoTracks().forEach(track => stream.addTrack(track));
    } catch { /* Camera is optional; keep the microphone and receive remote video. */ }
  }
  return stream;
}

export function useVoiceCall(uid: string | null) {
  const [call, setCall] = useState<VoiceCallRecord | null>(null);
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'connecting' | 'connected'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [hasLocalCamera, setHasLocalCamera] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [ringtoneBlocked, setRingtoneBlocked] = useState(false);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const remoteTracks = useRef<MediaStreamTrack[]>([]);
  const activeMedia = useRef<CallMedia>('audio');
  const callRef = useRef<VoiceCallRecord | null>(null);
  const callId = useRef<string | null>(null);
  const outgoing = useRef<{ id: string; conversationId: string; otherUid: string } | null>(null);
  const queuedCandidates = useRef<RTCIceCandidateInit[]>([]);
  const receivedCandidates = useRef(new Set<string>());
  const remoteAnswerApplied = useRef(false);
  const busy = useRef(false);
  const sounds = useRef<CallSounds | null>(null);
  const missedCalls = useRef(new Set<string>());
  const soundPlayer = useCallback(() => (sounds.current ??= new CallSounds()), []);

  const cleanup = useCallback(() => {
    sounds.current?.stop();
    setRingtoneBlocked(false);
    peer.current?.close();
    peer.current = null;
    localStream.current?.getTracks().forEach(track => track.stop());
    localStream.current = null;
    remoteTracks.current.forEach(track => { track.onmute = null; track.onunmute = null; });
    remoteTracks.current = [];
    remoteStream.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    activeMedia.current = 'audio';
    callId.current = null;
    outgoing.current = null;
    queuedCandidates.current = [];
    receivedCandidates.current.clear();
    remoteAnswerApplied.current = false;
    busy.current = false;
    setPhase('idle');
    setMuted(false);
    setCameraOff(false);
    setHasLocalCamera(false);
    setHasRemoteVideo(false);
    setPlaybackBlocked(false);
  }, []);

  const finishMissed = useCallback((previous: VoiceCallRecord | null) => {
    if (!previous || previous.callerId !== uid || previous.status !== 'ringing'
      || previous.expiresAt > Date.now() || missedCalls.current.has(previous.id)) return;
    missedCalls.current.add(previous.id);
    void soundPlayer().unanswered();
    setError('No answer. Try calling again later.');
  }, [uid, soundPlayer]);

  const publishCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const active = callRef.current;
    const id = callId.current;
    if (!uid) return;
    const pending = outgoing.current;
    const conversationId = active?.id === id ? active.conversationId : pending?.id === id ? pending.conversationId : null;
    const otherUid = active?.id === id ? active.callerId === uid ? active.calleeId : active.callerId : pending?.id === id ? pending.otherUid : null;
    if (!id || !conversationId || !otherUid) { queuedCandidates.current.push(candidate); return; }
    try {
      await signal('candidate', { callId: id, conversationId, otherUid, candidate });
    } catch { /* A later candidate may still connect the peers. */ }
  }, [uid]);

  const flushCandidates = useCallback(() => {
    const queued = queuedCandidates.current.splice(0);
    queued.forEach(candidate => { void publishCandidate(candidate); });
  }, [publishCandidate]);

  const preparePeer = useCallback(async (media: CallMedia) => {
    if (!window.RTCPeerConnection) throw new Error('This browser does not support calls. Try a current browser.');
    const stream = await captureMedia(media);
    try {
      const rtc = new RTCPeerConnection({ iceServers: await iceServers() });
      localStream.current = stream;
      activeMedia.current = media;
      peer.current = rtc;
      setHasLocalCamera(stream.getVideoTracks().length > 0);
      stream.getTracks().forEach(track => rtc.addTrack(track, stream));
      if (media === 'video' && stream.getVideoTracks().length === 0) rtc.addTransceiver('video', { direction: 'recvonly' });
      if (localVideoRef.current && media === 'video') localVideoRef.current.srcObject = stream;
      rtc.onicecandidate = event => { if (peer.current === rtc && event.candidate) void publishCandidate(event.candidate.toJSON()); };
      rtc.ontrack = event => {
        // Some mobile browsers provide no streams on the track event.
        const mediaStream = remoteStream.current ?? new MediaStream();
        remoteStream.current = mediaStream;
        if (!remoteTracks.current.includes(event.track)) {
          remoteTracks.current.push(event.track);
          mediaStream.addTrack(event.track);
        }
        if (event.track.kind === 'video') {
          setHasRemoteVideo(true);
          event.track.onmute = () => setHasRemoteVideo(false);
        }
        const player = media === 'video' ? remoteVideoRef.current : audioRef.current;
        if (!player) return;
        player.srcObject = mediaStream;
        player.muted = false;
        player.volume = 1;
        const resume = () => {
          void player.play().then(() => setPlaybackBlocked(false)).catch(() => setPlaybackBlocked(true));
        };
        event.track.onunmute = () => {
          if (event.track.kind === 'video') setHasRemoteVideo(true);
          resume();
        };
        resume();
      };
      rtc.onconnectionstatechange = () => {
        if (rtc.connectionState === 'connected') setPhase('connected');
        if (rtc.connectionState === 'failed') setError('Call connection failed. Try calling again.');
      };
      return rtc;
    } catch (e) { stream.getTracks().forEach(track => track.stop()); throw e; }
  }, [publishCandidate]);

  useEffect(() => {
    if (!call || call.media !== 'video') return;
    if (localVideoRef.current && localStream.current) localVideoRef.current.srcObject = localStream.current;
    if (remoteVideoRef.current && remoteStream.current) {
      remoteVideoRef.current.srcObject = remoteStream.current;
      void remoteVideoRef.current.play().then(() => setPlaybackBlocked(false)).catch(() => setPlaybackBlocked(true));
    }
  }, [call, hasLocalCamera]);

  const processCall = useCallback(async (active: VoiceCallRecord) => {
    const rtc = peer.current;
    if (!rtc || callId.current !== active.id) return;
    if (uid === active.callerId && active.answer && !remoteAnswerApplied.current) {
      remoteAnswerApplied.current = true;
      try { await rtc.setRemoteDescription(active.answer); setPhase('connecting'); }
      catch { setError('Could not connect this call.'); return; }
    }
    if (!rtc.remoteDescription) return;
    for (const candidate of (callRef.current?.id === active.id ? callRef.current : active).remoteCandidates ?? []) {
      const key = JSON.stringify(candidate);
      if (receivedCandidates.current.has(key)) continue;
      receivedCandidates.current.add(key);
      try { await rtc.addIceCandidate(candidate); } catch { /* Another candidate may work. */ }
    }
  }, [uid]);

  useEffect(() => {
    if (!uid) { cleanup(); setCall(null); return; }
    const db = firebaseDb();
    if (!db) return;
    return onSnapshot(doc(db, 'users', uid, 'private', 'voiceCall'), snapshot => {
      const next = snapshot.exists() ? snapshot.data() as VoiceCallRecord : null;
      if (!callIsLive(next)) {
        const previous = callRef.current;
        if (previous || peer.current) cleanup();
        finishMissed(next?.id === previous?.id ? next : previous);
        callRef.current = null;
        setCall(null);
        return;
      }
      if (callId.current && callId.current !== next!.id) cleanup();
      callRef.current = next;
      setCall(next);
      flushCandidates();
      void processCall(next!);
    }, e => setError(e.message));
  }, [uid, cleanup, processCall, finishMissed, flushCandidates]);

  useEffect(() => {
    if (!call) return;
    const timer = window.setInterval(() => {
      if (!callIsLive(call)) { cleanup(); finishMissed(callRef.current); callRef.current = null; setCall(null); }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [call, cleanup, finishMissed]);

  const ringingId = call?.status === 'ringing' ? call.id : null;
  useEffect(() => {
    const ringingCall = callRef.current;
    if (!ringingId || !ringingCall || phase === 'preparing') {
      sounds.current?.stop();
      setRingtoneBlocked(false);
      return;
    }
    const kind = ringingCall.calleeId === uid ? 'incoming' : 'outgoing';
    let current = true;
    void soundPlayer().ring(kind).then(playing => {
      if (current) setRingtoneBlocked(!playing);
    });
    return () => { current = false; sounds.current?.stop(); };
  }, [ringingId, phase, uid, soundPlayer]);

  useEffect(() => {
    const leave = () => {
      const active = callRef.current;
      const pending = outgoing.current;
      if (uid && ((active && callIsLive(active)) || pending)) {
        const otherUid = active ? active.callerId === uid ? active.calleeId : active.callerId : pending!.otherUid;
        void fetch('/api/dm/calls', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
          body: JSON.stringify({ action: 'end', callId: active?.id ?? pending!.id, conversationId: active?.conversationId ?? pending!.conversationId, otherUid }),
        }).catch(() => undefined);
      }
      peer.current?.close();
      localStream.current?.getTracks().forEach(track => track.stop());
      sounds.current?.close();
    };
    window.addEventListener('pagehide', leave);
    return () => { window.removeEventListener('pagehide', leave); leave(); };
  }, [uid]);

  const start = useCallback(async (conversationId: string, otherUid: string, media: CallMedia = 'audio') => {
    if (!uid || busy.current || callIsLive(callRef.current)) return;
    soundPlayer().unlock();
    busy.current = true;
    setPhase('preparing'); setError(null); setMicNotice(null);
    try {
      const rtc = await preparePeer(media);
      const offer = await rtc.createOffer();
      await rtc.setLocalDescription(offer);
      const data = await signal('start', { conversationId, otherUid, media, offer: { type: 'offer', sdp: offer.sdp } });
      callId.current = data.callId;
      outgoing.current = { id: data.callId, conversationId, otherUid };
      setPhase('connecting');
      flushCandidates();
      if (callRef.current?.id === data.callId) await processCall(callRef.current);
    } catch (e) { cleanup(); setError(e instanceof Error ? e.message : 'Could not start call.'); }
    finally { busy.current = false; }
  }, [uid, preparePeer, flushCandidates, processCall, cleanup, soundPlayer]);

  const accept = useCallback(async () => {
    const active = callRef.current;
    if (!uid || !active || active.calleeId !== uid || busy.current) return;
    soundPlayer().stop();
    busy.current = true;
    setPhase('preparing'); setError(null); setMicNotice(null);
    try {
      const rtc = await preparePeer(active.media ?? 'audio');
      callId.current = active.id;
      await rtc.setRemoteDescription(active.offer);
      const answer = await rtc.createAnswer();
      await rtc.setLocalDescription(answer);
      await signal('answer', { callId: active.id, conversationId: active.conversationId, otherUid: active.callerId, answer: { type: 'answer', sdp: answer.sdp } });
      setPhase('connecting');
      flushCandidates();
      await processCall(callRef.current ?? active);
    } catch (e) { cleanup(); setError(e instanceof Error ? e.message : 'Could not answer call.'); }
    finally { busy.current = false; }
  }, [uid, preparePeer, flushCandidates, processCall, cleanup, soundPlayer]);

  const end = useCallback(async () => {
    const active = callRef.current;
    const pending = outgoing.current;
    cleanup();
    setCall(null); callRef.current = null;
    if (!uid || (!active && !pending)) return;
    try { await signal('end', { callId: active?.id ?? pending!.id, conversationId: active?.conversationId ?? pending!.conversationId, otherUid: active ? active.callerId === uid ? active.calleeId : active.callerId : pending!.otherUid }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not end call.'); }
  }, [uid, cleanup]);

  const toggleMute = useCallback(() => {
    const track = localStream.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    const track = localStream.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCameraOff(!track.enabled);
  }, []);

  const playAudio = useCallback(() => {
    const player = activeMedia.current === 'video' ? remoteVideoRef.current : audioRef.current;
    if (!player?.srcObject) { setError('No audio has arrived from the other phone yet.'); return; }
    player.muted = false;
    player.volume = 1;
    void player.play().then(() => setPlaybackBlocked(false)).catch(() => setPlaybackBlocked(true));
  }, []);

  const enableRingtone = useCallback(() => {
    const active = callRef.current;
    if (!active || active.status !== 'ringing') return;
    const kind = active.calleeId === uid ? 'incoming' : 'outgoing';
    void soundPlayer().ring(kind).then(playing => setRingtoneBlocked(!playing));
  }, [uid, soundPlayer]);

  const checkMicrophone = useCallback(async () => {
    setError(null); setMicNotice(null);
    try {
      const stream = await captureMedia('audio');
      stream.getTracks().forEach(track => track.stop());
      setMicNotice('Microphone is ready. Tap Call or Answer.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not access the microphone.');
    }
  }, []);

  return { call, phase, error, micNotice, muted, cameraOff, hasLocalCamera, hasRemoteVideo, playbackBlocked, ringtoneBlocked, audioRef, remoteVideoRef, localVideoRef, start, accept, end, toggleMute, toggleCamera, playAudio, enableRingtone, checkMicrophone, clearError: () => setError(null), clearMicNotice: () => setMicNotice(null) };
}
