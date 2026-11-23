/**
 * A short two-note chime for new orders and updates, made with the Web Audio
 * API so there is no sound file to ship. Browsers stay silent until the person
 * has clicked or typed on the page once; that is the browser's rule, so a
 * failure here is ignored rather than shown.
 */
let context: AudioContext | null = null;

export function playChime(): void {
  try {
    context ??= new AudioContext();
    void context.resume();
    const start = context.currentTime;
    for (const [i, freq] of [880, 1320].entries()) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      const at = start + i * 0.15;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
      osc.connect(gain).connect(context.destination);
      osc.start(at);
      osc.stop(at + 0.4);
    }
  } catch {
    // No audio available (old browser, or sound blocked): the visual alert stands.
  }
}
