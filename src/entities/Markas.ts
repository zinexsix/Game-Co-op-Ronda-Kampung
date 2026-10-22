import type { StaticBox } from "../systems/Collision";

/** Pos ronda: nyawa bersama tim. Kalah jika HP mencapai 0. */
export class Markas {
  hp: number;
  /** Untuk benchmark: tidak bisa rusak. */
  invulnerable = false;
  /** Bertambah tiap kali markas terkena serangan (HUD memakai ini untuk efek getar). */
  hitCount = 0;

  constructor(
    readonly maxHp: number,
    readonly box: StaticBox,
  ) {
    this.hp = maxHp;
  }

  get destroyed(): boolean {
    return this.hp <= 0;
  }

  damage(amount: number): void {
    if (this.destroyed) return;
    this.hitCount++;
    if (this.invulnerable) return;
    this.hp = Math.max(0, this.hp - amount);
  }

  /** Pulihkan HP (Penyembuh). */
  heal(amount: number): void {
    if (this.destroyed) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  reset(): void {
    this.hp = this.maxHp;
    this.hitCount = 0;
  }
}
