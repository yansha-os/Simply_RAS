/**
 * Web Audio API Sound Synthesizer for Interactive UI & Click Physics.
 * Pure procedural audio synthesis — zero external MP3s or network assets required.
 */

import type { ClickSoundMode } from './themeRegistry';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playClickSound(mode: ClickSoundMode, volume: number = 0.5) {
  if (mode === 'none' || volume <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(1, volume * 0.4));
  gain.connect(ctx.destination);

  if (mode === 'subtle-click') {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.035);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(1, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    osc.connect(oscGain);
    oscGain.connect(gain);

    osc.start(now);
    osc.stop(now + 0.04);
  } else if (mode === 'sci-fi-blip') {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(1600, now + 0.07);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.8, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(oscGain);
    oscGain.connect(gain);

    osc.start(now);
    osc.stop(now + 0.09);
  } else if (mode === 'bubble-pop') {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.06);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, now);
    filter.Q.value = 4.0;

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(1, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(filter);
    filter.connect(oscGain);
    oscGain.connect(gain);

    osc.start(now);
    osc.stop(now + 0.07);
  } else if (mode === 'quantum-pulse') {
    const freqs = [330, 660, 990];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.9, now + 0.18);

      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime((1 / (idx + 1)) * 0.7, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(oscGain);
      oscGain.connect(gain);

      osc.start(now);
      osc.stop(now + 0.2);
    });
  }
}
