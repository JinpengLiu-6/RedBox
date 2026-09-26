/**
 * Goblin King Heist - Web Audio Sound Synthesizer
 * Zero external audio file dependencies. Rich synthesized game sound effects.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
  }

  public isMuted() {
    return this.muted;
  }

  public toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  public playClick() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.05);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  public playAttack(type: 'bolt' | 'cleave' | 'punch' | 'shotgun' | 'dagger') {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    switch (type) {
      case 'bolt':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(580, t);
        osc.frequency.exponentialRampToValueAtTime(220, t + 0.14);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.14);
        osc.start(t);
        osc.stop(t + 0.14);
        break;

      case 'cleave':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, t);
        osc.frequency.exponentialRampToValueAtTime(45, t + 0.2);
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        osc.start(t);
        osc.stop(t + 0.2);
        break;

      case 'punch':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(240, t);
        osc.frequency.exponentialRampToValueAtTime(70, t + 0.1);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        osc.start(t);
        osc.stop(t + 0.1);
        break;

      case 'shotgun':
        osc.type = 'square';
        osc.frequency.setValueAtTime(320, t);
        osc.frequency.exponentialRampToValueAtTime(60, t + 0.15);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
        osc.start(t);
        osc.stop(t + 0.15);
        break;

      case 'dagger':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(650, t);
        osc.frequency.exponentialRampToValueAtTime(280, t + 0.08);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
        osc.start(t);
        osc.stop(t + 0.08);
        break;
    }
  }

  public playSkill(skillId: string) {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    if (skillId.includes('nova') || skillId.includes('astral')) {
      // Cosmic blast chime
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.linearRampToValueAtTime(1320, t + 0.1);
      osc.frequency.exponentialRampToValueAtTime(330, t + 0.4);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
      osc.start(t);
      osc.stop(t + 0.4);
    } else if (skillId.includes('dynamite') || skillId.includes('bomb')) {
      // Explosion boom
      this.playExplosion();
    } else if (skillId.includes('roar') || skillId.includes('aegis')) {
      // Deep war buff
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(110, t);
      osc.frequency.linearRampToValueAtTime(260, t + 0.25);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.35);
    } else {
      // Swift dash / strike
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, t);
      osc.frequency.linearRampToValueAtTime(700, t + 0.12);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
      osc.start(t);
      osc.stop(t + 0.18);
    }
  }

  public playExplosion() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    // Low rumble oscillator
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.4);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  public playCrateInteract() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.setValueAtTime(380, t + 0.08);
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  public playTrapAlert() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.setValueAtTime(180, t + 0.1);
    osc.frequency.setValueAtTime(140, t + 0.2);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  public playDeliverySuccess() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    // Harmonious major triad arpeggio
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + idx * 0.08;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  }

  public playTowerDestroyed() {
    if (this.muted) return;
    this.playExplosion();
    // High crystal shattering tone
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(990, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.5);
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  }

  public playGoblinHurt() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.08);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  public playBossRoar() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.linearRampToValueAtTime(130, t + 0.2);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.6);
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.6);
  }

  public playVictory() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const fanfare = [
      { f: 523.25, d: 0.15 },
      { f: 659.25, d: 0.15 },
      { f: 783.99, d: 0.15 },
      { f: 1046.50, d: 0.45 },
    ];
    let offset = 0;
    fanfare.forEach((n) => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + offset;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, t);
      gain.gain.setValueAtTime(0.28, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + n.d);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + n.d);
      offset += n.d * 0.85;
    });
  }

  public playDefeat() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const notes = [330, 311.13, 293.66, 261.63];
    let offset = 0;
    notes.forEach((freq) => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + offset;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.35);
      offset += 0.28;
    });
  }
}

export const sound = new SoundEngine();
