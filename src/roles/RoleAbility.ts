import type { SkillData } from "../data/types";
import type { Markas } from "../entities/Markas";
import type { Player } from "../entities/Player";
import type { Effects } from "../systems/Effects";
import type { EnemyManager } from "../systems/EnemyManager";
import type { PlayerInputState, PlayerPresses } from "../systems/InputManager";
import type { ProjectileManager } from "../systems/ProjectileManager";
import type { StructureManager } from "../systems/StructureManager";

/** Sistem dan status tim yang boleh dipakai skill peran. */
export interface CombatContext {
  enemies: EnemyManager;
  projectiles: ProjectileManager;
  effects: Effects;
  structures: StructureManager;
  markas: Markas;
  /** Pemain yang ikut bermain. */
  players: readonly Player[];
  /** Koin bersama saat ini. */
  readonly coins: number;
  /** Potong koin bersama; false (tanpa memotong) jika koin kurang. */
  spendCoins(amount: number): boolean;
  /** Pesan singkat di kartu HUD pemain. kind "koin" juga membuat penghitung koin berkedip. */
  notify(player: Player, text: string, kind?: NoticeKind): void;
}

export type NoticeKind = "info" | "koin";

/** Status satu skill untuk HUD. */
export interface SkillStatus {
  readonly data: SkillData;
  /** Sisa cooldown (detik); 0 = siap. */
  cooldownLeft: number;
  /** true selama skill sedang bekerja (tombol tembak ditahan, perisai menyala, ...). */
  active: boolean;
}

/** Perilaku skill satu peran. */
export interface RoleAbility {
  readonly skills: [SkillStatus, SkillStatus];
  update(dt: number, player: Player, input: PlayerInputState, presses: PlayerPresses, ctx: CombatContext): void;
  reset(): void;
  /** Mode uji: cooldown langsung habis. */
  clearCooldowns(): void;
}

export function skillStatus(data: SkillData): SkillStatus {
  return { data, cooldownLeft: 0, active: false };
}

/** Kurangi cooldown kedua skill. */
export function tickCooldowns(skills: readonly SkillStatus[], dt: number): void {
  for (const s of skills) s.cooldownLeft = Math.max(0, s.cooldownLeft - dt);
}

/** Ambil nilai wajib dari roles.json; beri pesan jelas jika lupa diisi. */
export function need(value: number | undefined, field: string): number {
  if (value === undefined) throw new Error(`roles.json: nilai "${field}" wajib diisi`);
  return value;
}
