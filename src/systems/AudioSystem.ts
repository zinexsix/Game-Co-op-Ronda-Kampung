/**
 * Suara dan musik yang disintesis langsung dengan Web Audio (tanpa file aset, tanpa lisensi).
 * - Efek suara: nada pendek / derau berfilter, dibatasi frekuensinya agar tidak menumpuk.
 * - Musik: pola pentatonik bernuansa gamelan + kentongan, dijadwalkan sedikit di depan waktu audio.
 * AudioContext baru dibuat saat ada interaksi pertama (aturan autoplay browser).
 */

export type SoundId =
  | "tembak" | "area" | "perisai" | "pancing" | "bangun" | "jebakan" | "heal" | "buff"
  | "kena" | "markas" | "koin" | "revive" | "combo" | "boss" | "bossStun" | "kebal"
  | "musuhKalah" | "menang" | "kalah" | "pilih";

export type MusicMood = "menu" | "main" | "boss" | "diam";
export type VolumeKind = "master" | "music" | "sfx";

/** Jeda minimal antar pemutaran efek yang sama (detik), agar tembakan beruntun tidak memekakkan. */
const MIN_GAP: Partial<Record<SoundId, number>> = {
  tembak: 0.07, koin: 0.04, markas: 0.15, kena: 0.1, musuhKalah: 0.05, kebal: 0.2, bangun: 0.05,
};
const SCHEDULE_AHEAD = 0.15;
/** Tangga nada pentatonik (Hz), nuansa slendro. */
const SCALE = [293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.25];
/** Melodi 16 langkah (indeks SCALE, -1 = diam). */
const MELODY = [0, -1, 2, 3, 4, -1, 3, 2, 1, -1, 2, -1, 4, 5, 4, 2];
const BASS = [146.83, -1, -1, -1, 196.0, -1, -1, -1, 220.0, -1, -1, -1, 196.0, -1, -1, -1];
const MOODS: Record<Exclude<MusicMood, "diam">, { bpm: number; melody: boolean; drums: number; bassMul: number }> = {
  menu: { bpm: 84, melody: true, drums: 0, bassMul: 1 },
  main: { bpm: 100, melody: true, drums: 1, bassMul: 1 },
  boss: { bpm: 124, melody: true, drums: 2, bassMul: 0.5 },
};

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly volumes: Record<VolumeKind, number>;
  private muted = false;
  private readonly lastPlayed = new Map<SoundId, number>();
  private mood: MusicMood = "menu";
  private nextNoteTime = 0;
  private step = 0;

  constructor(defaults: Record<VolumeKind, number>) {
    this.volumes = { ...defaults };
  }

  /** Panggil dari interaksi pengguna (tombol/klik) untuk mengizinkan suara. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.masterGain = ctx.createGain();
      this.musicGain = ctx.createGain();
      this.sfxGain = ctx.createGain();
      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(ctx.destination);
      // Derau putih 1 detik untuk efek pukulan/ledakan.
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
      this.applyVolumes();
      this.nextNoteTime = ctx.currentTime + 0.1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  getVolume(kind: VolumeKind): number {
    return this.volumes[kind];
  }

  setVolume(kind: VolumeKind, value: number): void {
    this.volumes[kind] = Math.max(0, Math.min(1, value));
    this.applyVolumes();
  }

  toggleMute(): void {
    this.muted = !this.muted;
    this.applyVolumes();
  }

  /** Jeda total (game dijeda): hentikan semua suara sementara. */
  setPaused(paused: boolean): void {
    if (!this.ctx) return;
    if (paused && this.ctx.state === "running") void this.ctx.suspend();
    if (!paused && this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMood(mood: MusicMood): void {
    this.mood = mood;
  }

  /** Penjadwal musik; panggil tiap frame. */
  update(): void {
    const ctx = this.ctx;
    if (!ctx || this.mood === "diam" || ctx.state !== "running") return;
    const m = MOODS[this.mood];
    const stepSec = 60 / m.bpm / 2; // satu langkah = seperdelapan ketukan
    if (this.nextNoteTime < ctx.currentTime) this.nextNoteTime = ctx.currentTime + 0.05;
    while (this.nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD) {
      this.scheduleStep(this.step % 16, this.nextNoteTime, stepSec, m);
      this.nextNoteTime += stepSec;
      this.step++;
    }
  }

  /** Putar efek suara. */
  play(id: SoundId): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running" || !this.sfxGain) return;
    const now = ctx.currentTime;
    const gap = MIN_GAP[id] ?? 0;
    if (gap > 0 && now - (this.lastPlayed.get(id) ?? -1) < gap) return;
    this.lastPlayed.set(id, now);
    const out = this.sfxGain;
    const t = now + 0.005;
    switch (id) {
      case "tembak":
        this.tone(out, t, 0.05, "square", 880, 0.05, 620);
        break;
      case "area":
        this.noise(out, t, 0.35, 0.35, "lowpass", 900);
        this.tone(out, t, 0.3, "sine", 140, 0.4, 45);
        break;
      case "perisai":
        this.tone(out, t, 0.2, "triangle", 400, 0.18, 820);
        break;
      case "pancing":
        this.tone(out, t, 0.09, "square", 520, 0.08);
        this.tone(out, t + 0.1, 0.12, "square", 780, 0.08);
        break;
      case "bangun":
        this.noise(out, t, 0.05, 0.3, "bandpass", 1400);
        this.noise(out, t + 0.09, 0.05, 0.25, "bandpass", 1100);
        break;
      case "jebakan":
        this.tone(out, t, 0.06, "square", 1250, 0.07, 900);
        this.noise(out, t, 0.12, 0.2, "highpass", 3000);
        break;
      case "heal":
        [523.25, 659.25, 783.99].forEach((f, i) => this.tone(out, t + i * 0.07, 0.14, "sine", f, 0.14));
        break;
      case "buff":
        this.tone(out, t, 0.3, "sine", 300, 0.14, 950);
        this.noise(out, t, 0.25, 0.08, "bandpass", 2500);
        break;
      case "kena":
        this.tone(out, t, 0.15, "sawtooth", 170, 0.1, 90);
        break;
      case "markas":
        this.tone(out, t, 0.18, "sine", 95, 0.25, 50);
        break;
      case "koin":
        this.tone(out, t, 0.05, "square", 987.77, 0.06);
        this.tone(out, t + 0.05, 0.09, "square", 1318.5, 0.06);
        break;
      case "revive":
        [392, 523.25, 659.25, 783.99].forEach((f, i) => this.tone(out, t + i * 0.08, 0.18, "triangle", f, 0.15));
        break;
      case "combo":
        [523.25, 659.25, 783.99].forEach((f) => this.tone(out, t, 0.45, "triangle", f, 0.12));
        this.tone(out, t + 0.12, 0.3, "sine", 1567.98, 0.1);
        this.tone(out, t + 0.22, 0.3, "sine", 2093.0, 0.08);
        break;
      case "boss":
        this.tone(out, t, 0.9, "sawtooth", 75, 0.2, 52);
        this.noise(out, t, 0.6, 0.2, "lowpass", 300);
        break;
      case "bossStun":
        this.tone(out, t, 0.35, "square", 1500, 0.1, 280);
        break;
      case "kebal":
        this.tone(out, t, 0.06, "triangle", 220, 0.08);
        break;
      case "musuhKalah":
        this.noise(out, t, 0.06, 0.15, "bandpass", 900);
        this.tone(out, t, 0.08, "square", 320, 0.05, 150);
        break;
      case "menang":
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(out, t + i * 0.12, i === 3 ? 0.6 : 0.14, "triangle", f, 0.16));
        break;
      case "kalah":
        [392, 349.23, 311.13, 261.63].forEach((f, i) => this.tone(out, t + i * 0.18, 0.3, "sawtooth", f, 0.08));
        break;
      case "pilih":
        this.tone(out, t, 0.04, "square", 660, 0.06);
        break;
    }
  }

  private applyVolumes(): void {
    if (!this.masterGain || !this.musicGain || !this.sfxGain) return;
    this.masterGain.gain.value = this.muted ? 0 : this.volumes.master;
    this.musicGain.gain.value = this.volumes.music;
    this.sfxGain.gain.value = this.volumes.sfx;
  }

  private scheduleStep(i: number, t: number, stepSec: number, m: (typeof MOODS)["main"]): void {
    const out = this.musicGain;
    if (!out) return;
    const note = MELODY[i];
    if (m.melody && note >= 0) this.tone(out, t, stepSec * 1.6, "triangle", SCALE[note], 0.07);
    const bass = BASS[i];
    if (bass > 0) this.tone(out, t, stepSec * 3, "sine", bass * m.bassMul, 0.12);
    // Kentongan di awal birama, hi-hat lembut di ketukan lemah.
    if (i % 8 === 0) this.tone(out, t, 0.06, "square", 1046.5, 0.05, 900);
    if (m.drums >= 1 && i % 2 === 1) this.noise(out, t, 0.03, 0.04, "highpass", 6000);
    if (m.drums >= 2 && i % 4 === 0) this.tone(out, t, 0.12, "sine", 110, 0.18, 45);
  }

  /** Nada dengan amplop serang/lepas cepat; opsional geser frekuensi ke `slideTo`. */
  private tone(out: AudioNode, t: number, dur: number, type: OscillatorType, freq: number, gain: number, slideTo?: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Derau berfilter (pukulan, ledakan, desis). */
  private noise(out: AudioNode, t: number, dur: number, gain: number, filter: BiquadFilterType, freq: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }
}
