/** Minimal procedural audio: fire blip + explosion noise burst (WebAudio). */
export class AudioManager {
  private ctx: AudioContext | null = null;

  /** Browsers require a user gesture before audio can start. */
  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        this.ctx = null;
      }
    }
    this.ctx?.resume();
  }

  fire(power: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(180 + power * 120, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  }

  explosion(size: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const duration = 0.5 + size * 0.04;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      data[i] = (Math.random() * 2 - 1) * (1 - t) * (1 - t);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  }
}
