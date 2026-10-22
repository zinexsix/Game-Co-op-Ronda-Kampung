import type { ComboRules, RoleId } from "../data/types";

export type ComboKind = "jebakHabisi" | "tahanPulihkan" | "sapuBarikade";

/** Combo yang baru terjadi (untuk HUD, efek, suara). */
export interface ComboEvent {
  kind: ComboKind;
  label: string;
  x: number;
  z: number;
}

const LABELS: Record<ComboKind, string> = {
  jebakHabisi: "Jebak & Habisi",
  tahanPulihkan: "Tahan & Pulihkan",
  sapuBarikade: "Sapu Barikade",
};

/**
 * Deteksi combo kerja sama antar peran:
 * (a) Jebak & Habisi: musuh terkena jebakan lalu dikalahkan Penyerang dalam jendela waktu.
 * (b) Tahan & Pulihkan: Penjaga memblokir dan Penyembuh memulihkan pos ronda dalam jendela yang sama.
 * (c) Sapu Barikade: Serangan Area mengenai minimal N musuh yang menumpuk di barikade.
 * Tiap jenis punya jeda singkat agar satu momen tidak dihitung berkali-kali.
 */
export class ComboSystem {
  /** Combo di level yang sedang berjalan. */
  count = 0;
  private lastBlock = -Infinity;
  private lastMarkasHeal = -Infinity;
  private readonly nextAllowed: Record<ComboKind, number> = { jebakHabisi: 0, tahanPulihkan: 0, sapuBarikade: 0 };
  private pending: ComboEvent[] = [];

  constructor(private readonly rules: ComboRules) {}

  reset(): void {
    this.count = 0;
    this.lastBlock = -Infinity;
    this.lastMarkasHeal = -Infinity;
    for (const k of Object.keys(this.nextAllowed) as ComboKind[]) this.nextAllowed[k] = 0;
    this.pending = [];
  }

  /** Ambil (dan kosongkan) combo baru. */
  take(): ComboEvent[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  /** Musuh kalah. `trappedAge` = detik sejak terakhir kena jebakan (Infinity jika tidak pernah). */
  enemyKilled(now: number, source: RoleId | undefined, trappedAge: number, x: number, z: number): void {
    if (source === "penyerang" && trappedAge <= this.rules.trapKillWindowSec) this.trigger("jebakHabisi", now, x, z);
  }

  /** Perisai Penjaga memblokir serangan. */
  blocked(now: number, x: number, z: number): void {
    this.lastBlock = now;
    if (now - this.lastMarkasHeal <= this.rules.holdHealWindowSec) this.trigger("tahanPulihkan", now, x, z);
  }

  /** Penyembuh memulihkan pos ronda. */
  markasHealed(now: number, x: number, z: number): void {
    this.lastMarkasHeal = now;
    if (now - this.lastBlock <= this.rules.holdHealWindowSec) this.trigger("tahanPulihkan", now, x, z);
  }

  /** Serangan Area mengenai `stacked` musuh yang menumpuk di barikade. */
  areaAttack(now: number, stacked: number, x: number, z: number): void {
    if (stacked >= this.rules.barricadeStackMin) this.trigger("sapuBarikade", now, x, z);
  }

  private trigger(kind: ComboKind, now: number, x: number, z: number): void {
    if (now < this.nextAllowed[kind]) return;
    this.nextAllowed[kind] = now + this.rules.cooldownSec;
    // Satu momen kerja sama dihitung sekali: setelah combo blokir+heal, jendelanya dimulai ulang.
    if (kind === "tahanPulihkan") {
      this.lastBlock = -Infinity;
      this.lastMarkasHeal = -Infinity;
    }
    this.count++;
    this.pending.push({ kind, label: LABELS[kind], x, z });
  }
}
