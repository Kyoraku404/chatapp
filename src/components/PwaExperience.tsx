'use client';

import { useEffect } from 'react';

// Keep phone installation available through the browser without interrupting chats.
export function PwaExperience() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => undefined);
  }, []);
  return null;
}
