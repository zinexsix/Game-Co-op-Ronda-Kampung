import type { ScoreRules } from "../data/types";

/** Rincian skor satu level. */
export interface LevelScore {
  levelName: string;
  markasHp: number;
  markasPoints: number;
  combos: number;
  comboPoints: number;
  seconds: number;
  timeBonus: number;
  total: number;
}

/**
 * Skor tim (tanpa skor individu):
 * (sisa HP markas x markasHpPoints) + (jumlah combo x comboPoints) + bonus waktu.
 * Bonus waktu = sisa detik di bawah waktu par level x timeBonusPerSec.
 */
export class ScoreSystem {
  /** Skor level-level yang sudah dimenangkan dalam permainan ini. */
  readonly levels: LevelScore[] = [];

  constructor(private readonly rules: ScoreRules) {}

  get total(): number {
    return this.levels.reduce((n, l) => n + l.total, 0);
  }

  /** Hitung skor level (belum disimpan). Combo = 0 sampai Tahap 6. */
  compute(levelName: string, markasHp: number, combos: number, seconds: number, parTimeSec: number): LevelScore {
    const hp = Math.max(0, Math.ceil(markasHp));
    const markasPoints = hp * this.rules.markasHpPoints;
    const comboPoints = combos * this.rules.comboPoints;
    const timeBonus = Math.max(0, Math.floor(parTimeSec - seconds)) * this.rules.timeBonusPerSec;
    return {
      levelName,
      markasHp: hp,
      markasPoints,
      combos,
      comboPoints,
      seconds,
      timeBonus,
      total: markasPoints + comboPoints + timeBonus,
    };
  }

  /** Simpan skor level yang dimenangkan. */
  commit(score: LevelScore): void {
    this.levels.push(score);
  }

  /** Permainan baru dari Level 1. */
  reset(): void {
    this.levels.length = 0;
  }
}
