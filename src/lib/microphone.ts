export function microphoneError(error: unknown, secureContext: boolean, embedded: boolean): string {
  if (!secureContext) return 'Microphone access needs HTTPS on your phone. Open RUSH with an https:// link, then tap Call again.';
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return embedded
      ? 'Open RUSH directly in your browser, then allow microphone access when you tap Call or Answer.'
      : 'Microphone access is blocked. Allow it in your browser’s site settings and phone privacy settings, then try again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No microphone was found on this device.';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'Your microphone is in use or unavailable. Close other apps using it and try again.';
  return error instanceof Error ? error.message : 'Could not access the microphone. Try again.';
}
