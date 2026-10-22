import type { AbstractEngine, AbstractMesh, DirectionalLight, ShadowGenerator } from "@babylonjs/core";
import { QUALITY_PRESETS, type QualityLevel } from "../config/quality";

/** Menerapkan preset kualitas (bayangan + skala resolusi render) saat runtime. */
/** Aturan penurunan skala resolusi otomatis (game.json "autoQuality"). */
export interface AutoQualityRules {
  minFps: number;
  sampleSec: number;
  renderScaleSteps: number[];
}

export class QualityManager {
  private _level: QualityLevel;
  /** Langkah penurunan otomatis yang sedang dipakai (-1 = belum diturunkan). */
  private autoStep = -1;
  private sampleTime = 0;
  private sampleFrames = 0;
  private readonly listeners: ((level: QualityLevel) => void)[] = [];

  constructor(
    private readonly engine: AbstractEngine,
    private readonly sun: DirectionalLight,
    private readonly shadows: ShadowGenerator,
    initial: QualityLevel,
  ) {
    this._level = initial;
    this.apply(initial);
  }

  get level(): QualityLevel {
    return this._level;
  }

  onChange(fn: (level: QualityLevel) => void): void {
    this.listeners.push(fn);
  }

  /** Daftarkan mesh bergerak (pemain, musuh) sebagai pembuat bayangan. */
  addDynamicCasters(meshes: AbstractMesh[]): void {
    for (const m of meshes) this.shadows.addShadowCaster(m, false);
  }

  toggle(): void {
    this.apply(this._level === "rendah" ? "sedang" : "rendah");
  }

  /** Skala resolusi yang sedang dipakai (1 = penuh). */
  get renderScale(): number {
    const preset = QUALITY_PRESETS[this._level];
    return this.autoStep < 0 ? preset.renderScale : Math.min(preset.renderScale, this.autoStepScale);
  }

  private autoStepScale = 1;

  /**
   * Pantau FPS; jika rata-rata selama sampleSec di bawah minFps, turunkan skala resolusi satu langkah.
   * Mengembalikan skala baru jika berubah (untuk pemberitahuan), selain itu null.
   */
  autoAdjust(dt: number, rules: AutoQualityRules): number | null {
    if (document.visibilityState !== "visible") return null;
    this.sampleTime += dt;
    this.sampleFrames++;
    if (this.sampleTime < rules.sampleSec) return null;
    const fps = this.sampleFrames / this.sampleTime;
    this.sampleTime = 0;
    this.sampleFrames = 0;
    if (fps >= rules.minFps) return null;
    const current = this.renderScale;
    const next = rules.renderScaleSteps.findIndex((s) => s < current - 1e-3);
    if (next < 0) return null; // sudah di langkah terendah
    this.autoStep = next;
    this.autoStepScale = rules.renderScaleSteps[next];
    this.engine.setHardwareScalingLevel(1 / this.renderScale);
    return this.renderScale;
  }

  apply(level: QualityLevel): void {
    const preset = QUALITY_PRESETS[level];
    this._level = level;
    // Pilihan manual mengembalikan skala resolusi preset.
    this.autoStep = -1;
    this.autoStepScale = 1;
    this.sampleTime = 0;
    this.sampleFrames = 0;
    // Bayangan hanya di Sedang. Mematikan shadowEnabled juga melewati render pass shadow map.
    this.sun.shadowEnabled = preset.shadows;
    // Skala resolusi: hardwareScalingLevel 1/scale (mis. 0.75 -> 1.333).
    this.engine.setHardwareScalingLevel(1 / preset.renderScale);
    for (const fn of this.listeners) fn(level);
  }
}
