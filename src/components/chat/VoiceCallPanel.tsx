import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff, Volume2, X } from 'lucide-react';
import type { VoiceCallRecord } from '@/lib/voiceCalls';

export interface VoiceCallControls {
  call: VoiceCallRecord | null;
  phase: 'idle' | 'preparing' | 'connecting' | 'connected';
  error: string | null;
  micNotice: string | null;
  muted: boolean;
  cameraOff: boolean;
  hasLocalCamera: boolean;
  hasRemoteVideo: boolean;
  playbackBlocked: boolean;
  ringtoneBlocked: boolean;
  audioRef: React.RefObject<HTMLAudioElement>;
  remoteVideoRef: React.RefObject<HTMLVideoElement>;
  localVideoRef: React.RefObject<HTMLVideoElement>;
  accept: () => Promise<void>;
  end: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  playAudio: () => void;
  enableRingtone: () => void;
  checkMicrophone: () => Promise<void>;
  clearError: () => void;
  clearMicNotice: () => void;
}

export function VoiceCallPanel({ voice, uid }: { voice: VoiceCallControls; uid: string }) {
  const { call, phase } = voice;
  const incoming = call?.calleeId === uid && call.status === 'ringing' && phase === 'idle';
  const video = call?.media === 'video';
  const name = call ? call.callerId === uid ? call.calleeName : call.callerName : '';
  const status = incoming ? 'Incoming call' : phase === 'connected' ? 'Connected' : call?.status === 'ringing' ? 'Ringing…' : 'Connecting…';

  return <>
    <audio ref={voice.audioRef} autoPlay aria-label="Call audio" />
    {voice.error && <div role="alert" className="voice-error"><span>{voice.error}</span>{/microphone|https|browser/i.test(voice.error) && <button className="voice-check-mic" onClick={() => void voice.checkMicrophone()}>Check mic</button>}<button onClick={voice.clearError} aria-label="Dismiss call error"><X size={16} /></button></div>}
    {voice.micNotice && <div role="status" className="voice-error"><span>{voice.micNotice}</span><button onClick={voice.clearMicNotice} aria-label="Dismiss microphone message"><X size={16} /></button></div>}
    {call && <div className="call-backdrop">
      <aside role="dialog" aria-modal="true" aria-label={`${video ? 'Video' : 'Voice'} call with ${name}`} className={`call-screen${video ? ' call-screen-video' : ''}`}>
        <div className="call-topline"><span className="call-brand">RUSH</span><span className="call-kind">{video ? <Video size={14} /> : <Phone size={14} />} {video ? 'Video call' : 'Voice call'}</span></div>
        {video ? <div className="video-call-stage">
          <video ref={voice.remoteVideoRef} autoPlay playsInline aria-label={`${name}'s video`} className={`video-call-remote${voice.hasRemoteVideo ? ' is-visible' : ''}`} />
          {!voice.hasRemoteVideo && <div className="video-call-placeholder"><span className="video-call-initial">{name.trim().charAt(0).toUpperCase() || '?'}</span><span>{phase === 'connected' ? `${name}'s camera is off` : 'Waiting for video…'}</span></div>}
          <video ref={voice.localVideoRef} autoPlay muted playsInline aria-label="Your camera preview" className={`video-call-local${voice.hasLocalCamera ? ' is-visible' : ''}`} />
          {voice.hasLocalCamera && voice.cameraOff && <span className="video-call-camera-off">Camera off</span>}
        </div> : <div className="call-portrait" aria-hidden="true"><div className="call-portrait-ring"><span>{name.trim().charAt(0).toUpperCase() || '?'}</span></div></div>}
        <div className="call-identity">
          <h2>{name}</h2>
          <p role="status" aria-live="polite"><span className={`call-status-dot${phase === 'connected' ? ' is-connected' : ''}`} />{status}</p>
          {video && phase !== 'idle' && !voice.hasLocalCamera && <p className="call-hint">Your camera is unavailable. Audio and incoming video still work.</p>}
          {incoming && <p className="call-hint">{video ? 'Answer with your mic; camera is optional.' : 'Tap Answer to use your microphone.'}</p>}
        </div>
        <div className="call-bottom">
          {voice.ringtoneBlocked && call.status === 'ringing' && <button className="call-audio-action" onClick={voice.enableRingtone}><Volume2 size={16} /> Enable ringtone</button>}
          {(voice.playbackBlocked || phase === 'connected') && <button className="call-audio-action" onClick={voice.playAudio}><Volume2 size={16} /> {voice.playbackBlocked ? 'Tap to hear call' : 'Play call audio'}</button>}
          <div className="call-controls">
            {incoming ? <button className="call-control call-answer" onClick={() => void voice.accept()}><span><Phone size={24} /></span><small>Answer</small></button> : <>
              <button className="call-control" onClick={voice.toggleMute} disabled={phase === 'preparing' || phase === 'idle'} aria-label={voice.muted ? 'Unmute microphone' : 'Mute microphone'}><span>{voice.muted ? <MicOff size={24} /> : <Mic size={24} />}</span><small>{voice.muted ? 'Unmute' : 'Mute'}</small></button>
              {video && voice.hasLocalCamera && <button className="call-control" onClick={voice.toggleCamera} disabled={phase === 'preparing' || phase === 'idle'} aria-label={voice.cameraOff ? 'Turn camera on' : 'Turn camera off'}><span>{voice.cameraOff ? <VideoOff size={24} /> : <Video size={24} />}</span><small>{voice.cameraOff ? 'Camera on' : 'Camera off'}</small></button>}
            </>}
            <button className="call-control call-hangup" onClick={() => void voice.end()}><span><PhoneOff size={24} /></span><small>{incoming ? 'Decline' : 'Hang up'}</small></button>
          </div>
        </div>
      </aside>
    </div>}
  </>;
}
