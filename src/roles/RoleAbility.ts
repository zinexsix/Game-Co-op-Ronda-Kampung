import type { SkillData } from "../data/types";
import type { Player } from "../entities/Player";
import type { Effects } from "../systems/Effects";
import type { EnemyManager } from "../systems/EnemyManager";
import type { PlayerInputState } from "../systems/InputManager";
import type { ProjectileManager } from "../systems/ProjectileManager";

/** Sistem yang boleh dipakai skill peran. */
export interface CombatContext {
  enemies: EnemyManager;
  projectiles: ProjectileManager;
  effects: Effects;
}

/** Status satu skill untuk HUD. */
export interface SkillStatus {
  readonly data: SkillData;
  /** false = belum dibuat (menyusul di tahap berikutnya). */
  readonly implemented: boolean;
  /** Sisa cooldown (detik); 0 = siap. */
  cooldownLeft: number;
  /** true selama skill sedang dipakai (mis. tombol tembak ditahan). */
  active: boolean;
}

/** Perilaku skill satu peran. */
export interface RoleAbility {
  readonly skills: [SkillStatus, SkillStatus];
  update(dt: number, player: Player, input: PlayerInputState, ctx: CombatContext): void;
  reset(): void;
}

export function skillStatus(data: SkillData, implemented: boolean): SkillStatus {
  return { data, implemented, cooldownLeft: 0, active: false };
}

/** Peran yang skill-nya belum dibuat (Tahap 3): bisa bergerak, skill belum aktif. */
export class PendingAbility implements RoleAbility {
  readonly skills: [SkillStatus, SkillStatus];

  constructor(skills: [SkillData, SkillData]) {
    this.skills = [skillStatus(skills[0], false), skillStatus(skills[1], false)];
  }

  update(): void {}

  reset(): void {}
}
