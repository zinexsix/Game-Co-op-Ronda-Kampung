import type { AbstractEngine, AbstractMesh, DirectionalLight, ShadowGenerator } from "@babylonjs/core";
import { QUALITY_PRESETS, type QualityLevel } from "../config/quality";

/** Menerapkan preset kualitas (bayangan + skala resolusi render) saat runtime. */
export class QualityManager {
  private _level: QualityLevel;
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

  apply(level: QualityLevel): void {
    const preset = QUALITY_PRESETS[level];
    this._level = level;
    // Bayangan hanya di Sedang. Mematikan shadowEnabled juga melewati render pass shadow map.
    this.sun.shadowEnabled = preset.shadows;
    // Skala resolusi: hardwareScalingLevel 1/scale (mis. 0.75 -> 1.333).
    this.engine.setHardwareScalingLevel(1 / preset.renderScale);
    for (const fn of this.listeners) fn(level);
  }
}
