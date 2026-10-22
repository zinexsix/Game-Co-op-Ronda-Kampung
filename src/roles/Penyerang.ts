import type { RoleData, SkillData } from "../data/types";
import type { Player } from "../entities/Player";
import type { PlayerInputState } from "../systems/InputManager";
import { skillStatus, type CombatContext, type RoleAbility, type SkillStatus } from "./RoleAbility";

const MUZZLE_OFFSET = 0.3; // proyektil keluar sedikit di depan tubuh

/**
 * Penyerang.
 * Skill 1 Serangan Cepat: tahan tombol untuk menembak beruntun searah hadap.
 * Skill 2 Serangan Area: damage ke semua musuh dalam radius, lalu cooldown.
 */
export class PenyerangAbility implements RoleAbility {
  readonly skills: [SkillStatus, SkillStatus];
  private readonly rapid: Required<Pick<SkillData, "fireInterval" | "damage" | "projectileSpeed" | "range">>;
  private readonly area: Required<Pick<SkillData, "radius" | "cooldown" | "damage">>;
  private fireTimer = 0;

  constructor(role: RoleData) {
    const [s1, s2] = role.skills;
    this.rapid = {
      fireInterval: need(s1.fireInterval, "fireInterval"),
      damage: need(s1.damage, "damage"),
      projectileSpeed: need(s1.projectileSpeed, "projectileSpeed"),
      range: need(s1.range, "range"),
    };
    this.area = {
      radius: need(s2.radius, "radius"),
      cooldown: need(s2.cooldown, "cooldown"),
      damage: need(s2.damage, "damage"),
    };
    this.skills = [skillStatus(s1, true), skillStatus(s2, true)];
  }

  /** Jumlah proyektil maksimal yang bisa melayang bersamaan (untuk ukuran pool). */
  get maxProjectilesInFlight(): number {
    const flightSec = this.rapid.range / this.rapid.projectileSpeed;
    return Math.ceil(flightSec / this.rapid.fireInterval) + 1;
  }

  update(dt: number, player: Player, input: PlayerInputState, ctx: CombatContext): void {
    const [rapid, area] = this.skills;
    area.cooldownLeft = Math.max(0, area.cooldownLeft - dt);
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    rapid.active = false;
    if (player.downed) return;

    // Serangan cepat: tembak tiap fireInterval selama tombol ditahan.
    if (input.skill1) {
      rapid.active = true;
      if (this.fireTimer <= 0) {
        this.fireTimer = this.rapid.fireInterval;
        const fx = player.facingX;
        const fz = player.facingZ;
        const offset = player.radius + MUZZLE_OFFSET;
        ctx.projectiles.fire(
          player.position.x + fx * offset,
          player.position.z + fz * offset,
          fx,
          fz,
          this.rapid.projectileSpeed,
          this.rapid.range,
          this.rapid.damage,
        );
      }
    }

    // Serangan area: langsung aktif saat tombol ditekan dan cooldown habis.
    if (input.skill2 && area.cooldownLeft <= 0) {
      area.cooldownLeft = this.area.cooldown;
      const { x, z } = player.position;
      ctx.effects.areaBlast(x, z, this.area.radius);
      ctx.enemies.damageInRadius(x, z, this.area.radius, this.area.damage);
    }
  }

  reset(): void {
    this.fireTimer = 0;
    for (const s of this.skills) {
      s.cooldownLeft = 0;
      s.active = false;
    }
  }
}

function need(value: number | undefined, field: string): number {
  if (value === undefined) throw new Error(`roles.json: penyerang butuh nilai "${field}"`);
  return value;
}
