import { describe, expect, it } from 'vitest';
import { microphoneError } from './microphone';

describe('microphone permission guidance', () => {
  it('explains why a phone opened over HTTP will not show a prompt', () => {
    expect(microphoneError(undefined, false, false)).toMatch(/HTTPS/);
  });
  it('gives separate steps for denied and embedded microphone access', () => {
    const denied = new DOMException('Permission denied', 'NotAllowedError');
    expect(microphoneError(denied, true, false)).toMatch(/site settings/);
    expect(microphoneError(denied, true, true)).toMatch(/directly in your browser/);
  });
});
