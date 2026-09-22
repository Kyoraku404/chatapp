import { Mic, MicOff, Phone, PhoneOff, Volume2, X } from 'lucide-react';
import type { VoiceCallRecord } from '@/lib/voiceCalls';

export interface VoiceCallControls {
  call: VoiceCallRecord | null;
  phase: 'idle' | 'preparing' | 'connecting' | 'connected';
  error: string | null;
  micNotice: string | null;
  muted: boolean;
  playbackBlocked: boolean;
  ringtoneBlocked: boolean;
  audioRef: React.RefObject<HTMLAudioElement>;
  accept: () => Promise<void>;
  end: () => Promise<void>;
  toggleMute: () => void;
  playAudio: () => void;
  enableRingtone: () => void;
  checkMicrophone: () => Promise<void>;
  clearError: () => void;
  clearMicNotice: () => void;
}

export function VoiceCallPanel({ voice, uid }: { voice: VoiceCallControls; uid: string }) {
  const { call, phase } = voice;
  const incoming = call?.calleeId === uid && call.status === 'ringing' && phase === 'idle';
  const name = call ? call.callerId === uid ? call.calleeName : call.callerName : '';
  return <>
    <audio ref={voice.audioRef} autoPlay aria-label="Call audio" />
    {voice.error && <div role="alert" className="voice-error"><span>{voice.error}</span>{/microphone|https|browser/i.test(voice.error) && <button className="voice-check-mic" onClick={() => void voice.checkMicrophone()}>Check mic</button>}<button onClick={voice.clearError} aria-label="Dismiss call error"><X size={16} /></button></div>}
    {voice.micNotice && <div role="status" className="voice-error"><span>{voice.micNotice}</span><button onClick={voice.clearMicNotice} aria-label="Dismiss microphone message"><X size={16} /></button></div>}
    {call && <aside role="dialog" aria-label={`Voice call with ${name}`} className="voice-panel">
      <div className="voice-avatar" aria-hidden="true"><Phone size={22} /></div>
      <p className="font-display text-lg font-semibold">{name}</p>
      <p className="text-sm text-ink-500">{incoming ? 'Incoming voice call' : phase === 'connected' ? 'Connected' : call.status === 'ringing' ? 'Ringing…' : 'Connecting audio…'}</p>
      {incoming && <p className="mt-2 text-xs text-ink-500">Tap Answer to allow microphone access.</p>}
      <div className="mt-5 flex items-center justify-center gap-4">
        {incoming ? <button className="voice-accept" onClick={() => void voice.accept()}><Phone size={18} /> Answer</button> : <button className="voice-mute" onClick={voice.toggleMute} disabled={phase === 'preparing' || phase === 'idle'} aria-label={voice.muted ? 'Unmute microphone' : 'Mute microphone'}>{voice.muted ? <MicOff size={20} /> : <Mic size={20} />}</button>}
        <button className="voice-end" onClick={() => void voice.end()}><PhoneOff size={18} /> {incoming ? 'Decline' : 'Hang up'}</button>
      </div>
      {voice.ringtoneBlocked && call.status === 'ringing' && <button className="voice-play" onClick={voice.enableRingtone}><Volume2 size={16} /> Enable ringtone</button>}
      {(voice.playbackBlocked || phase === 'connected') && <button className="voice-play" onClick={voice.playAudio}><Volume2 size={16} /> {voice.playbackBlocked ? 'Tap to hear audio' : 'Play call audio'}</button>}
    </aside>}
  </>;
}
