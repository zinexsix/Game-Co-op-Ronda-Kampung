import type { RoleData } from "../data/types";
import type { Player } from "../entities/Player";
import type { PlayerInputState, PlayerPresses } from "../systems/InputManager";
import { need, skillStatus, tickCooldowns, type CombatContext, type RoleAbility, type SkillStatus } from "./RoleAbility";

const MUZZLE_OFFSET = 0.3; // proyektil keluar sedikit di depan tubuh

/**
 * Penyerang.
 * Skill 1 Serangan Cepat: tahan tombol untuk menembak beruntun searah hadap.
 * Skill 2 Serangan Area: damage ke semua musuh dalam radius, lalu cooldown.
 */
export class PenyerangAbility implements RoleAbility {
  readonly skills: [SkillStatus, SkillStatus];
  private readonly fireInterval: number;
  private readonly rapidDamage: number;
  private readonly projectileSpeed: number;
  private readonly range: number;
  private readonly areaRadius: number;
  private readonly areaCooldown: number;
  private readonly areaDamage: number;
  private fireTimer = 0;

  constructor(role: RoleData) {
    const [s1, s2] = role.skills;
    this.fireInterval = need(s1.fireInterval, "serangan_cepat.fireInterval");
    this.rapidDamage = need(s1.damage, "serangan_cepat.damage");
    this.projectileSpeed = need(s1.projectileSpeed, "serangan_cepat.projectileSpeed");
    this.range = need(s1.range, "serangan_cepat.range");
    this.areaRadius = need(s2.radius, "serangan_area.radius");
    this.areaCooldown = need(s2.cooldown, "serangan_area.cooldown");
    this.areaDamage = need(s2.damage, "serangan_area.damage");
    this.skills = [skillStatus(s1), skillStatus(s2)];
  }

  /** Jumlah proyektil maksimal yang bisa melayang bersamaan (untuk ukuran pool). */
  get maxProjectilesInFlight(): number {
    const flightSec = this.range / this.projectileSpeed;
    return Math.ceil(flightSec / this.fireInterval) + 1;
  }

  update(dt: number, player: Player, input: PlayerInputState, presses: PlayerPresses, ctx: CombatContext): void {
    const [rapid, area] = this.skills;
    tickCooldowns(this.skills, dt);
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    rapid.active = false;
    if (player.downed) return;

    // Serangan cepat: tembak tiap fireInterval selama tombol ditahan.
    if (input.skill1) {
      rapid.active = true;
      if (this.fireTimer <= 0) {
        this.fireTimer = this.fireInterval;
        const fx = player.facingX;
        const fz = player.facingZ;
        const offset = player.radius + MUZZLE_OFFSET;
        ctx.projectiles.fire(
          player.position.x + fx * offset,
          player.position.z + fz * offset,
          fx,
          fz,
          this.projectileSpeed,
          this.range,
          this.rapidDamage,
        );
      }
    }

    // Serangan area saat tombol ditekan dan cooldown habis.
    if (presses.skill2 && area.cooldownLeft <= 0) {
      area.cooldownLeft = this.areaCooldown;
      const { x, z } = player.position;
      ctx.effects.areaBlast(x, z, this.areaRadius);
      ctx.enemies.damageInRadius(x, z, this.areaRadius, this.areaDamage);
    }
  }

  reset(): void {
    this.fireTimer = 0;
    for (const s of this.skills) {
      s.cooldownLeft = 0;
      s.active = false;
    }
  }

  clearCooldowns(): void {
    for (const s of this.skills) s.cooldownLeft = 0;
  }
}
