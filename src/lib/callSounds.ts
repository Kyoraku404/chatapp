type SoundKind = 'incoming' | 'outgoing';

// A small synthesized RUSH motif keeps the call sounds local and avoids loading audio files.
export class CallSounds {
  private context: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ringing: SoundKind | null = null;
  private generation = 0;
  private ringNotes = new Set<OscillatorNode>();

  private async ready(): Promise<AudioContext | null> {
    if (typeof window === 'undefined') return null;
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return null;
    if (!this.context || this.context.state === 'closed') this.context = new AudioContextClass();
    if (this.context.state === 'suspended') {
      try { await this.context.resume(); } catch { return null; }
    }
    return this.context.state === 'running' ? this.context : null;
  }

  // Call synchronously from the call button's gesture so browsers permit later ringback.
  unlock(): void { void this.ready(); }

  private note(frequency: number, start: number, duration: number, volume: number, ring = false): void {
    const context = this.context;
    if (!context || context.state !== 'running') return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.018);
    gain.gain.setValueAtTime(volume, start + Math.max(0.02, duration - 0.06));
    gain.gain.linearRampToValueAtTime(0, start + duration);
    oscillator.connect(gain).connect(context.destination);
    if (ring) {
      this.ringNotes.add(oscillator);
      oscillator.onended = () => this.ringNotes.delete(oscillator);
    }
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private motif(kind: SoundKind): void {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime + 0.02;
    if (kind === 'incoming') {
      // Rising three-note signature, followed by a softer response.
      this.note(523.25, now, 0.17, 0.075, true);
      this.note(659.25, now + 0.2, 0.17, 0.075, true);
      this.note(783.99, now + 0.4, 0.3, 0.085, true);
      this.note(659.25, now + 0.82, 0.15, 0.055, true);
      this.note(783.99, now + 1.02, 0.34, 0.065, true);
    } else {
      this.note(440, now, 0.28, 0.045, true);
      this.note(554.37, now + 0.34, 0.28, 0.045, true);
    }
  }

  async ring(kind: SoundKind): Promise<boolean> {
    this.stop();
    const generation = this.generation;
    const context = await this.ready();
    if (!context || generation !== this.generation) return false;
    this.ringing = kind;
    this.motif(kind);
    this.timer = setInterval(() => this.motif(kind), kind === 'incoming' ? 2600 : 3000);
    return true;
  }

  stop(): void {
    this.generation++;
    this.ringing = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const note of this.ringNotes) {
      try { note.stop(); } catch { /* The note already finished. */ }
    }
    this.ringNotes.clear();
  }

  async unanswered(): Promise<void> {
    this.stop();
    if (!await this.ready() || !this.context) return;
    const now = this.context.currentTime + 0.02;
    for (let i = 0; i < 3; i++) this.note(740, now + i * 0.28, 0.12, 0.09);
  }

  close(): void {
    this.stop();
    const context = this.context;
    this.context = null;
    if (context) void context.close();
  }
}
