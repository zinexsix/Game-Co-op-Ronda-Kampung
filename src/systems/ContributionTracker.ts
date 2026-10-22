import { ROLES, type RoleId } from "../data/types";

/** Jenis kontribusi yang dicatat per peran (untuk penentuan MVP di Tahap 5). */
export type ContributionStat =
  | "damage" // damage ke musuh
  | "kills"
  | "blocked" // damage yang ditahan perisai
  | "lured" // musuh yang terpancing
  | "healed" // HP teman / markas yang dipulihkan
  | "buffs" // anggota tim yang diberi buff
  | "barricades" // barikade dipasang
  | "barricadeAbsorbed" // damage yang ditahan barikade
  | "trapsTriggered" // jebakan terpakai
  | "trapStuns" // musuh terkena stun jebakan
  | "revives" // teman yang dihidupkan
  | "coins"; // koin dipungut

export type Contributions = Record<ContributionStat, number>;

function empty(): Contributions {
  return {
    damage: 0, kills: 0, blocked: 0, lured: 0, healed: 0, buffs: 0,
    barricades: 0, barricadeAbsorbed: 0, trapsTriggered: 0, trapStuns: 0, revives: 0, coins: 0,
  };
}

/** Pencatat kontribusi per peran sepanjang satu permainan (semua level). */
export class ContributionTracker {
  private readonly byRole = new Map<RoleId, Contributions>();
  /** Salinan saat level dimulai, supaya "Coba Lagi" tidak menghitung ganda. */
  private checkpoint = new Map<RoleId, Contributions>();

  constructor() {
    this.reset();
  }

  add(role: RoleId | undefined, stat: ContributionStat, amount = 1): void {
    if (!role || amount <= 0) return;
    const c = this.byRole.get(role);
    if (c) c[stat] += amount;
  }

  get(role: RoleId): Readonly<Contributions> {
    return this.byRole.get(role) ?? empty();
  }

  /** Mulai permainan baru: semua nol. */
  reset(): void {
    for (const r of ROLES) this.byRole.set(r.id, empty());
    this.saveCheckpoint();
  }

  /** Simpan kondisi di awal level. */
  saveCheckpoint(): void {
    this.checkpoint = new Map([...this.byRole].map(([id, c]) => [id, { ...c }]));
  }

  /** Kembali ke kondisi awal level (Coba Lagi). */
  restoreCheckpoint(): void {
    for (const [id, c] of this.checkpoint) this.byRole.set(id, { ...c });
  }
}
