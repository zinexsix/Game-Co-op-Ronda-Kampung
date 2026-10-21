import type { QualityLevel } from "../config/quality";
import { QUALITY_PRESETS } from "../config/quality";
import type { InputManager } from "./InputManager";

export interface BenchResult {
  quality: QualityLevel;
  avgFps: number;
  /** FPS rata-rata terendah dalam jendela 1 detik. */
  minFps1s: number;
  /** FPS dari frame time persentil 99 ("1% low"). */
  low1pct: number;
  frames: number;
  renderWidth: number;
  renderHeight: number;
  /** true jika tab/jendela sempat tersembunyi saat mengukur (browser men-throttle, hasil tidak valid). */
  disturbed: boolean;
}

const WARMUP_SEC = 3;
const MEASURE_SEC = 15;

/**
 * Benchmark otomatis: untuk tiap kualitas, 4 karakter digerakkan autopilot
 * (memutar di arena) dengan 30 musuh aktif, lalu FPS rata-rata & terendah dicatat.
 */
export class Benchmark {
  running = false;
  private queue: QualityLevel[] = [];
  private phase: "warmup" | "measure" = "warmup";
  private t = 0;
  private frameTimes: number[] = [];
  private windowFrames = 0;
  private windowTime = 0;
  private windowFps: number[] = [];
  private results: BenchResult[] = [];
  private disturbed = false;

  constructor(
    private readonly input: InputManager,
    private readonly setQuality: (level: QualityLevel) => void,
    private readonly getRenderSize: () => { w: number; h: number },
    private readonly onStatus: (text: string) => void,
    private readonly onDone: (results: BenchResult[]) => void,
  ) {}

  start(levels: QualityLevel[] = ["rendah", "sedang"]): void {
    this.running = true;
    this.queue = [...levels];
    this.results = [];
    this.next();
  }

  /** Dipanggil tiap frame SEBELUM input.update agar autopilot menimpa input. */
  tick(dtSec: number, totalTime: number): void {
    if (!this.running) return;
    this.drive(totalTime);
    this.t += dtSec;

    if (this.phase === "warmup") {
      if (this.t >= WARMUP_SEC) {
        this.phase = "measure";
        this.t = 0;
      }
      return;
    }

    if (document.visibilityState !== "visible") this.disturbed = true;
    this.frameTimes.push(dtSec);
    this.windowFrames++;
    this.windowTime += dtSec;
    if (this.windowTime >= 1) {
      this.windowFps.push(this.windowFrames / this.windowTime);
      this.windowFrames = 0;
      this.windowTime = 0;
    }
    const level = this.queue[0];
    this.onStatus(`Benchmark ${QUALITY_PRESETS[level].label}: ${Math.ceil(MEASURE_SEC - this.t)} dtk`);
    if (this.t >= MEASURE_SEC) this.finishLevel(level);
  }

  private next(): void {
    const level = this.queue[0];
    if (!level) {
      this.running = false;
      for (let i = 0; i < this.input.playerCount; i++) this.input.setOverride(i, null);
      this.onDone(this.results);
      return;
    }
    this.setQuality(level);
    this.phase = "warmup";
    this.t = 0;
    this.frameTimes = [];
    this.windowFps = [];
    this.windowFrames = 0;
    this.windowTime = 0;
    this.disturbed = false;
    this.onStatus(`Benchmark ${QUALITY_PRESETS[level].label}: pemanasan...`);
  }

  private finishLevel(level: QualityLevel): void {
    const total = this.frameTimes.reduce((a, b) => a + b, 0);
    const sorted = [...this.frameTimes].sort((a, b) => b - a);
    const p99 = sorted[Math.floor(sorted.length * 0.01)] ?? sorted[0];
    const size = this.getRenderSize();
    this.results.push({
      quality: level,
      avgFps: this.frameTimes.length / total,
      minFps1s: Math.min(...this.windowFps),
      low1pct: 1 / p99,
      frames: this.frameTimes.length,
      renderWidth: size.w,
      renderHeight: size.h,
      disturbed: this.disturbed,
    });
    this.queue.shift();
    this.next();
  }

  /** Autopilot: tiap pemain bergerak melingkar dengan fase berbeda (input analog penuh). */
  private drive(time: number): void {
    for (let i = 0; i < this.input.playerCount; i++) {
      const a = time * 0.9 + (i * Math.PI) / 2;
      this.input.setOverride(i, {
        moveX: Math.cos(a),
        moveZ: Math.sin(a),
        skill1: false,
        skill2: false,
        connected: true,
      });
    }
  }
}
