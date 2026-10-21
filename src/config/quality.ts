// Preset kualitas grafis. Rendah = tanpa bayangan + resolusi render diturunkan.
export type QualityLevel = "rendah" | "sedang";

export interface QualityPreset {
  label: string;
  shadows: boolean;
  shadowMapSize: number;
  /** 1 = resolusi penuh (CSS pixel), 0.75 = 75% lalu di-upscale. */
  renderScale: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  rendah: { label: "Rendah", shadows: false, shadowMapSize: 1024, renderScale: 0.75 },
  sedang: { label: "Sedang", shadows: true, shadowMapSize: 1024, renderScale: 1.0 },
};

export const DEFAULT_QUALITY: QualityLevel = "sedang";
