'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Returns a `play()` that sounds a short two-note chime via Web Audio.
 *
 * Browsers block audio until the user has interacted with the page, so we lazily
 * create and resume an AudioContext on the first pointer/key event and keep it
 * warm for later programmatic plays. If audio is never unlocked, play() is a
 * no-op and the visual glow is the fallback.
 */
export function useAlertChime() {
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const unlock = () => {
      if (!ctxRef.current) {
        const Ctx: typeof AudioContext | undefined =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) ctxRef.current = new Ctx();
      }
      ctxRef.current?.resume().catch(() => {});
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  return useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.state !== 'running') return; // not unlocked yet
    const now = ctx.currentTime;
    const notes = [880, 1174.66]; // A5 → D6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.14;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }, []);
}
